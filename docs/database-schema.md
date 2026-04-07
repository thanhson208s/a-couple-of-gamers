# Database Schema

> **[DRAFT — pending approval]** This schema is a proposal. Review and confirm before any implementation begins.

All Postgres table definitions (users, games, matches, match_players, moves, rival_stats, user_favorites, device_tokens, notifications), proposed indexes, and data ownership map (Postgres vs Redis vs device SQLite).

---

## Tables

### `users`
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
provider        TEXT NOT NULL          -- 'google' | 'apple' | 'facebook'
provider_id     TEXT NOT NULL          -- ID from the auth provider
display_name    TEXT NOT NULL
avatar_url      TEXT
is_ad_free      BOOLEAN NOT NULL DEFAULT false
created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
UNIQUE (provider, provider_id)
```

### `refresh_tokens`
```sql
id          UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
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
name             TEXT NOT NULL
description      TEXT
cover_image_url  TEXT
min_players      INT NOT NULL DEFAULT 2
max_players      INT NOT NULL DEFAULT 2
has_hidden_info  BOOLEAN NOT NULL DEFAULT false
is_active        BOOLEAN NOT NULL DEFAULT true   -- toggle to hide games from lobby
is_preinstalled  BOOLEAN NOT NULL DEFAULT false  -- bundled in the app package; no download needed
bundle_url       TEXT             -- R2 CDN URL for the Cocos Asset Bundle (NULL if preinstalled)
bundle_version   TEXT             -- version string; client compares against local to detect updates
bundle_size_bytes INT             -- shown during download
min_app_version  TEXT             -- minimum hot-update app version required to run this game
```

### `matches`
```sql
id                  UUID PRIMARY KEY DEFAULT gen_random_uuid()
game_id             UUID NOT NULL REFERENCES games(id)
status              TEXT NOT NULL    -- 'pending' | 'active' | 'completed' | 'abandoned'
state               JSONB NOT NULL   -- full game state; shape owned by game plugin
player1_id          UUID             -- NULL if guest; set by creator
player1_guest_uuid  TEXT             -- NULL if logged-in; set by creator
player2_id          UUID             -- NULL if guest or not yet joined
player2_guest_uuid  TEXT             -- NULL if logged-in or not yet joined
current_turn        INT              -- 1 or 2; NULL when pending or game over
winner              INT              -- 1, 2, or 0 (draw); NULL if not finished
invite_code         TEXT UNIQUE      -- short alphanumeric; NULL after opponent joins or match is cancelled
created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
-- updated_at used by inactive match cleanup worker to detect stale matches
-- Invariant: exactly one of player1_id / player1_guest_uuid is set; same for player2 once joined
```
_vs AI matches are client-only — no server record is created._

### `moves`
```sql
id          UUID PRIMARY KEY DEFAULT gen_random_uuid()
match_id    UUID NOT NULL REFERENCES matches(id)
player_id   UUID             -- NULL if guest or AI move
guest_uuid  TEXT             -- NULL if logged-in player or AI
move_data   JSONB NOT NULL   -- game-specific move payload
created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
```
_Purpose: audit log and foundation for future replay feature. Not used to reconstruct current state (state is stored directly in `matches.state`)._

### `rival_stats`
```sql
user_id     UUID NOT NULL REFERENCES users(id)
opponent_id UUID NOT NULL REFERENCES users(id)
game_id     UUID NOT NULL REFERENCES games(id)
wins        INT NOT NULL DEFAULT 0
losses      INT NOT NULL DEFAULT 0
draws       INT NOT NULL DEFAULT 0
PRIMARY KEY (user_id, opponent_id, game_id)
```
_Updated at match completion. Only for logged-in users — guests do not appear here._

### `user_favorites`
```sql
user_id UUID NOT NULL REFERENCES users(id)
game_id UUID NOT NULL REFERENCES games(id)
PRIMARY KEY (user_id, game_id)
```

### `device_tokens`
```sql
id          UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id     UUID NOT NULL REFERENCES users(id)
token       TEXT NOT NULL
platform    TEXT NOT NULL    -- 'ios' | 'android'
updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
UNIQUE (user_id, token)
```
_FCM device tokens. A user may have multiple devices. Tokens are upserted on login/app open._

### `notifications`
```sql
id          UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id     UUID NOT NULL REFERENCES users(id)
type        TEXT NOT NULL    -- e.g. 'your_turn', 'match_invite', 'match_result'
payload     JSONB NOT NULL   -- type-specific data (match_id, etc.)
sent_at     TIMESTAMPTZ NOT NULL DEFAULT now()
```
_Log of FCM notifications sent. Used for deduplication and debugging._

### `config`
```sql
id         SERIAL PRIMARY KEY   -- always a single row (id = 1)
config     JSONB NOT NULL       -- full config document; shape defined in features/remote-config.md
updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
updated_by TEXT                 -- admin identifier for audit trail
```
_Single-row table. Always update in place. `GET /v1/config` reads this row._

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
| Match state | Postgres `matches.state` | Source of truth always |
| Active room cache | Redis | Ephemeral; re-populated from Postgres on reconnect |
| Guest match history | Device SQLite + Postgres | Device caches for offline; Postgres has canonical record |
| Logged-in user history | Postgres only | Fetched on demand |
| User settings / ad-free flag | Postgres `users` | Synced on login |
| Favorites (guest) | Device SQLite only | Not synced to server |
| Favorites (logged-in) | Postgres `user_favorites` | |
