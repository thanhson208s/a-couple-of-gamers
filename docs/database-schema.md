# Database Schema

> **[DRAFT — pending approval]** Tables marked `[DRAFT]` are proposed but not yet migrated. All other tables are live.

All Postgres table definitions, proposed indexes, and data ownership map (Postgres vs Redis vs device SQLite).

---

## Tables

### `users`
```sql
id              CHAR(10) PRIMARY KEY     -- server-generated; 10 uppercase alphanumeric chars (A-Z2-9, no ambiguous chars); used as PK, JWT sub, and client-facing identifier
provider        TEXT NOT NULL            -- Firebase sign_in_provider: 'google.com' | 'apple.com' | 'facebook.com' | 'anonymous' | 'dev'
provider_id     TEXT NOT NULL UNIQUE     -- Firebase UID
display_name    TEXT NOT NULL
avatar_url      TEXT                     -- Firebase photoURL; NULL for anonymous users or when not provided
created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
```

### `refresh_tokens`
```sql
id          UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id     CHAR(10) NOT NULL REFERENCES users(id) ON DELETE CASCADE
token_hash  TEXT NOT NULL UNIQUE   -- SHA-256 of the raw opaque token; never store raw token
expires_at  TIMESTAMPTZ NOT NULL
revoked_at  TIMESTAMPTZ            -- NULL = active; set on use or reuse detection
created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
```
_Rotation: each use revokes the old row and inserts a new one. Reuse of a revoked token triggers full session wipe (`revoked_at` set on all rows for that user)._

### `games`
```sql
id               UUID PRIMARY KEY DEFAULT gen_random_uuid()
slug             TEXT NOT NULL UNIQUE   -- e.g. 'tictactoe', 'battleship'
name             TEXT NOT NULL          -- display name; initially set to slug, update via admin
status           INTEGER NOT NULL DEFAULT 1  -- 0=under_maintenance, 1=coming_soon, 2=enabled, 3=disabled; admin-set via dashboard
```
_Bundle version and URL per slug live in `game-bundles/<env>/manifest.json` on R2 (written by CI — see [hot-update.md#source-of-truth](hot-update.md#source-of-truth)); game metadata (display name, icons, banners, intro/rule images) and the canonical slug list live in the client catalog (hot-updated — see [features/games-management.md](features/games-management.md)). Neither lives in this table._

### `matches`
```sql
id           UUID PRIMARY KEY DEFAULT gen_random_uuid()
game_id      UUID NOT NULL REFERENCES games(id)
status       TEXT NOT NULL    -- 'active' | 'completed' | 'abandoned'  (pending matches live in Redis only)
state        JSONB NOT NULL   -- full game state; shape owned by game plugin
player1_id   CHAR(10) REFERENCES users(id) ON DELETE CASCADE
player2_id   CHAR(10) REFERENCES users(id) ON DELETE CASCADE
options      JSONB            -- game-specific creation options (e.g. difficulty); NULL if omitted
current_turn INT              -- 1 or 2; NULL when game over
winner       INT              -- 1, 2, or 0 (draw); NULL if not finished
created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
-- updated_at used by inactive match cleanup worker to detect stale matches
```
_Pending matches are stored in Redis only (see Data Ownership below). A Postgres row is created only when the second player joins. vs AI matches are client-only — no server record is created._

### `moves`
```sql
id          UUID PRIMARY KEY DEFAULT gen_random_uuid()
match_id    UUID NOT NULL REFERENCES matches(id)
player_id   CHAR(10) REFERENCES users(id) ON DELETE SET NULL  -- NULL if AI move
move_data   JSONB NOT NULL   -- game-specific move payload
created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
```
_Purpose: audit log and foundation for future replay feature. Not used to reconstruct current state (state is stored directly in `matches.state`)._

### `config`
```sql
id         SERIAL PRIMARY KEY   -- always a single row (id = 1)
config     JSONB NOT NULL       -- full config document
updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
updated_by TEXT                 -- admin identifier for audit trail
```
_Single-row table. Always update in place. `GET /v1/config` reads this row._

### `rival_stats` `[DRAFT]`
```sql
user_id     CHAR(10) NOT NULL REFERENCES users(id)
opponent_id CHAR(10) NOT NULL REFERENCES users(id)
game_id     UUID NOT NULL REFERENCES games(id)
wins        INT NOT NULL DEFAULT 0
losses      INT NOT NULL DEFAULT 0
draws       INT NOT NULL DEFAULT 0
PRIMARY KEY (user_id, opponent_id, game_id)
```
_Updated at match completion._

### `user_favorites` `[DRAFT]`
```sql
user_id CHAR(10) NOT NULL REFERENCES users(id)
game_id UUID NOT NULL REFERENCES games(id)
PRIMARY KEY (user_id, game_id)
```

### `device_tokens` `[DRAFT]`
```sql
id          UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id     CHAR(10) NOT NULL REFERENCES users(id)
token       TEXT NOT NULL
platform    TEXT NOT NULL    -- 'ios' | 'android'
updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
UNIQUE (user_id, token)
```
_FCM device tokens. A user may have multiple devices. Tokens are upserted on login/app open._

### `notifications` `[DRAFT]`
```sql
id          UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id     CHAR(10) NOT NULL REFERENCES users(id)
type        TEXT NOT NULL    -- e.g. 'your_turn', 'match_invite', 'match_result'
payload     JSONB NOT NULL   -- type-specific data (match_id, etc.)
sent_at     TIMESTAMPTZ NOT NULL DEFAULT now()
```
_Log of FCM notifications sent. Used for deduplication and debugging._

---

## Proposed Indexes

```sql
-- Match lookups
CREATE INDEX ON matches(status);
CREATE INDEX ON matches(updated_at);   -- inactive match cleanup worker
CREATE INDEX ON matches(player1_id);
CREATE INDEX ON matches(player2_id);

-- Move history
CREATE INDEX ON moves(match_id, created_at);

-- Rival stats lookups
CREATE INDEX ON rival_stats(user_id, opponent_id);
```

---

## Data Ownership

| Data | Where stored | Notes |
|------|-------------|-------|
| Pending match | Redis `pending_matches:invite:{inviteCode}` (JSON, EX 86400) | Never written to Postgres; auto-expires after 24 h |
| Pending match user index | Redis `pending_matches:user:{userId}` (sorted set, no TTL) | Secondary index for list/cancel; lazily pruned |
| Match state | Postgres `matches.state` | Source of truth always; row created on join |
| Active room cache | Redis | Ephemeral; re-populated from Postgres on reconnect |
| Logged-in user history | Postgres only | Fetched on demand |
| User settings | Postgres `users` | Synced on login |
| Favorites | Postgres `user_favorites` | |
