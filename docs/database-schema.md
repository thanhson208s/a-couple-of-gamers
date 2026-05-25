# Database Schema

All Postgres table definitions, indexes, and Redis key catalog.

Tables without a tag are **live** (migrated). `[DRAFT]` = entity exists but no migration yet.

---

## Postgres Tables

### `users`
```sql
id              CHAR(10) PRIMARY KEY     -- server-generated; charset A-Z + 2-9 (base32, no ambiguous chars); used as PK, JWT sub, and client-facing identifier
provider        TEXT NOT NULL            -- Firebase sign_in_provider: 'google.com' | 'apple.com' | 'facebook.com' | 'anonymous' | 'dev'
provider_id     TEXT NOT NULL UNIQUE     -- Firebase UID
display_name    TEXT NOT NULL
avatar_url      TEXT                     -- Firebase photoURL; NULL for anonymous users or when not provided
created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
```

### `games`
```sql
id      TEXT PRIMARY KEY       -- slug, e.g. 'tictactoe', 'battleship'
name    TEXT NOT NULL          -- display name; initially set to id, update via admin API
status  INTEGER NOT NULL DEFAULT 1  -- 0=under_maintenance, 1=coming_soon, 2=enabled, 3=disabled
```

### `matches`
```sql
id           UUID PRIMARY KEY DEFAULT uuid_generate_v4()
game_id      TEXT REFERENCES games(id)
status       TEXT NOT NULL    -- 'active' | 'completed' | 'abandoned'  (pending matches live in Redis only)
state        JSONB NOT NULL   -- full game state; shape owned by game plugin
player1_id   CHAR(10) REFERENCES users(id) ON DELETE SET NULL  -- nullable: preserved as NULL after account deletion
player2_id   CHAR(10) REFERENCES users(id) ON DELETE SET NULL
options      JSONB            -- game-specific creation options; NULL if omitted
winner       INT              -- 1v1: 1=p1 wins, 2=p2 wins, 0=draw; coop: 1=both win, 0=both lose; NULL if not finished
created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
```
_Pending matches are stored in Redis only (see Redis Keys below). A Postgres row is created only when the second player joins. vs AI matches are client-only — no server record is created. `updated_at` is used by the stale-match cleanup worker to detect inactive matches (>30 days) and abandoned matches (>1 day)._

### `config`
```sql
id         SERIAL PRIMARY KEY   -- always a single row (id = 1)
config     JSONB NOT NULL       -- full config document (see ConfigData interface in config.entity.ts)
updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
updated_by TEXT                 -- admin identifier for audit trail; NULL if not set
```
_Single-row table. Always updated in place. `GET /v1/config` reads this row._

### `refresh_tokens`
```sql
id          UUID PRIMARY KEY DEFAULT uuid_generate_v4()
user_id     CHAR(10) NOT NULL REFERENCES users(id) ON DELETE CASCADE
token_hash  TEXT NOT NULL UNIQUE   -- SHA-256 of the raw opaque token; never store raw token
expires_at  TIMESTAMPTZ NOT NULL
revoked_at  TIMESTAMPTZ            -- NULL = active; set on use or reuse detection
created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
```
_Rotation: each use revokes the old row and inserts a new one. Reuse of a revoked token triggers full session wipe (`revoked_at` set on all rows for that user)._

### `user_rivals`
```sql
user_id1    CHAR(10) NOT NULL REFERENCES users(id) ON DELETE CASCADE
user_id2    CHAR(10) NOT NULL            -- no FK: opponent row kept when they delete account
game_id     TEXT NOT NULL REFERENCES games(id)
match_count INT GENERATED ALWAYS AS (win_count + loss_count + draw_count) STORED
win_count   INT NOT NULL DEFAULT 0
loss_count  INT NOT NULL DEFAULT 0
draw_count  INT NOT NULL DEFAULT 0
PRIMARY KEY (user_id1, user_id2, game_id)
```
_Two rows per pair per game: (A,B) and (B,A). `win_count`/`loss_count`/`draw_count` are from `user_id1`'s perspective. Updated at match completion._

### `user_favorites`
```sql
user_id CHAR(10) NOT NULL REFERENCES users(id) ON DELETE CASCADE
game_id TEXT NOT NULL REFERENCES games(id)
PRIMARY KEY (user_id, game_id)
```

### `user_friends`
```sql
requester_id CHAR(10) NOT NULL REFERENCES users(id) ON DELETE CASCADE
addressee_id CHAR(10) NOT NULL REFERENCES users(id) ON DELETE CASCADE
status       TEXT NOT NULL DEFAULT 'pending'   -- 'pending' | 'accepted'
created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
CHECK (requester_id != addressee_id)
PRIMARY KEY (requester_id, addressee_id)
```
_Directional: (A→B) is the request row; (B→A) does not exist until accepted (then the single row's status flips)._

### `fcm_tokens` 
```sql
token       TEXT PRIMARY KEY             -- FCM token; globally unique
user_id     CHAR(10) NOT NULL REFERENCES users(id) ON DELETE CASCADE
platform    TEXT NOT NULL                -- 'ios' | 'android'
created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
```
_FCM device tokens for sending push notifications._

### `user_entitlements` 
```sql
user_id                  CHAR(10) NOT NULL REFERENCES users(id) ON DELETE CASCADE
entitlement_id           TEXT NOT NULL       -- RevenueCat entitlement identifier
store                    TEXT NOT NULL       -- 'play_store' | 'app_store'
original_transaction_id  TEXT NOT NULL
created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
PRIMARY KEY (user_id, entitlement_id)
```
_Tracks active in-app purchase entitlements synced from RevenueCat webhooks. Entity exists; migration pending._

---

## Indexes

No explicit indexes beyond PKs and unique constraints are defined in migrations yet. Candidates for future addition:

```sql
CREATE INDEX ON matches(player1_id);
CREATE INDEX ON matches(player2_id);
CREATE INDEX ON matches(status, updated_at);  -- stale-match cleanup worker
CREATE INDEX ON user_rivals(user_id1);
```

---

## Redis Keys

All keys follow `namespace:subtype:identifier` naming. TTLs are set on write and reset on sliding-window reads where noted.

| Key pattern | Type | TTL | Value | Notes |
|-------------|------|-----|-------|-------|
| `invite:code:{inviteCode}` | STRING | 24 h | JSON `MatchInvite` | Pending match data; auto-expires if not joined |
| `invite:user:{userId}` | SORTED SET | none | members = inviteCodes, scores = expiresAt (ms) | User's pending invite index; lazily pruned via `ZREMRANGEBYSCORE` |
| `match:meta:{matchId}` | STRING | sliding: 1 day (active) / 30 days (inactive) | JSON `{ player1Id, player2Id, gameId, status }` | Fast lookup cache; refreshed on every read; deleted on game over / cleanup |
| `match:state:{matchId}` | STRING | sliding 1 h | JSON `GameState` | In-flight match state cache; Postgres is flushed at session boundaries; deleted on game over / cleanup |
| `match:user:{userId}` | STRING | none | `matchId` | Tracks which match a user currently has open (is viewing); set on `match:open`, deleted on `match:close` / disconnect |
| `match:replay:{matchId}:{userId}` | STRING | 7 days | JSON `{ initialView, steps: [{move, view, playerIndex}] }` | Buffered moves for offline player; consumed (GETDEL) on `match:open`; cleared on game over |
| `ws:ticket:{ticket}` | STRING | 60 s | `userId` | One-time WS auth token; deleted on first use |
| `ws:throttle:{event}:{userId}` | STRING | per-event TTL (default 60 s) | integer counter | WS rate-limit counter; incremented per message, expires after TTL window |
