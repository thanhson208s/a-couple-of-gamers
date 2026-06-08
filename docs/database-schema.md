# Database Schema and Redis State

Canonical reference for persisted application state. The committed migration is
the authority for deployed PostgreSQL structure; entity differences that affect
runtime behavior are recorded in [Material Drift](#material-drift).

## PostgreSQL Tables

### `users`

Stores the application identity linked to an authentication provider.

| Column | Type / Constraints | Purpose |
|---|---|
| `id` | `char(10)` primary key | Server-generated public/user identity. |
| `provider` | `text` not null | Current identity provider value. |
| `provider_id` | `text` not null, unique | Firebase UID or development account identifier. |
| `display_name` | `text` not null | Profile display name. |
| `avatar_url` | `text`, nullable | Profile avatar URL. |
| `created_at` | `timestamptz` not null, default `now()` | Creation timestamp. |

### `graves`

Stores deleted-account tombstones and pending external deletion cleanup state.
Rows are not foreign-keyed to `users` because the corresponding user row is
removed.

| Column | Type / Constraints | Purpose |
|---|---|---|
| `user_id` | `char(10)` primary key | Former server-generated user identity; reserved against reuse. |
| `provider_id` | `text` not null, unique | Former Firebase UID or development account identifier. |
| `created_at` | `timestamptz` not null, default `now()` | Tombstone creation timestamp. |
| `is_processed` | `boolean` not null, default `false` | Whether external deletion cleanup has completed. |
| `processed_at` | `timestamptz`, nullable | External cleanup completion timestamp. |
| `external_cleanup` | `jsonb`, nullable | Snapshot of external cleanup inputs captured before deleting the user row; cleared after worker processing. |

### `refresh_tokens`

Stores rotating application sessions.

| Column | Type / Constraints | Purpose |
|---|---|---|
| `id` | `uuid` primary key, generated | Token row identity. |
| `user_id` | `char(10)` not null, FK to `users.id` with cascading delete | Token owner. |
| `token_hash` | `text` not null, unique | SHA-256 hash of the opaque refresh token. |
| `expires_at` | `timestamptz` not null | Expiration. |
| `revoked_at` | `timestamptz`, nullable | Revocation/rotation marker. |
| `created_at` | `timestamptz` not null, default `now()` | Creation timestamp. |

### `games`

Stores the persisted catalog row for registered and administratively
configured games.

| Column | Type / Constraints | Purpose |
|---|---|---|
| `id` | `text` primary key | Game slug. |
| `name` | `text` not null | Administrative display name. |
| `status` | `integer` not null, default `1` | Availability state used by new-match creation. |

Status semantics are described in
[Game Catalog and Configuration](systems/game-config.md).

### `config`

Stores JSON runtime configuration. Application reads and writes target row
`id = 1`; this single-row usage is an application convention, not a database
constraint.

| Column | Type / Constraints | Purpose |
|---|---|---|
| `id` | `serial` primary key | Configuration row identity. |
| `config` | `jsonb` not null | Version and account-limit configuration document. |
| `updated_at` | `timestamptz` not null, default `now()` | Update timestamp. |
| `updated_by` | `text`, nullable | Optional mutation attribution. |

### `matches`

Stores joined matches only. Pending invitations are not rows in this table.

| Column | Type / Constraints | Purpose |
|---|---|---|
| `id` | `uuid` primary key, generated | Durable match identity. |
| `game_id` | `text`, nullable, FK to `games.id` | Game identity. |
| `status` | `text` not null | `active`, `completed`, or `abandoned`. |
| `state` | `jsonb` not null | Plugin-owned game state. |
| `options` | `jsonb`, nullable | Plugin-specific creation options. |
| `player1_id`, `player2_id` | `char(10)` not null, FK to `users.id` with `ON DELETE CASCADE` | Participant IDs. |
| `winner` | `integer`, nullable | Completion result (`0`, `1`, or `2`). |
| `created_at`, `updated_at` | `timestamptz` not null, default `now()` | Record timestamps. |

Deleting either participant deletes the durable match row.

### `user_favorites`

| Column | Type / Constraints | Purpose |
|---|---|---|
| `user_id` | `char(10)` PK part, FK to `users.id` with cascading delete | User identity. |
| `game_id` | `text` PK part, FK to `games.id` | Favorited game. |

### `user_rivals`

| Column | Type / Constraints | Purpose |
|---|---|---|
| `id` | `uuid` primary key, generated | Rival row identity. |
| `user_id1` | `char(10)` not null, FK to `users.id` with cascading delete | Perspective owner. |
| `user_id2` | `char(10)`, nullable, FK to `users.id` with `ON DELETE SET NULL` | Opponent identifier while the opponent account exists. |
| `game_id` | `text` not null, FK to `games.id` | Game identity. |
| `match_count` | `integer`, stored generated value | Sum of win/loss/draw counts. |
| `win_count`, `loss_count`, `draw_count` | `integer` not null, default `0` | Results from `user_id1`'s perspective. |

The committed schema also enforces uniqueness on
`user_id1` / `user_id2` / `game_id`. When an opponent account is removed,
`user_id2` becomes `NULL` so the perspective owner's historical aggregate row
can survive without retaining the deleted user's server ID.

### `user_friends`

| Column | Type / Constraints | Purpose |
|---|---|---|
| `requester_id` | `char(10)` PK part, FK to `users.id` with cascading delete | Request origin. |
| `addressee_id` | `char(10)` PK part, FK to `users.id` with cascading delete | Request destination. |
| `status` | `text` not null, default `pending` | Request/accepted state. |
| `created_at`, `updated_at` | `timestamptz` not null, default `now()` | Relationship timestamps in the migration. |

### `fcm_tokens`

| Column | Type / Constraints | Purpose |
|---|---|---|
| `token` | `text` primary key | FCM device registration token. |
| `user_id` | `char(10)` not null, FK to `users.id` with cascading delete | Token owner. |
| `platform` | `text` not null | Device platform marker. |
| `created_at`, `updated_at` | `timestamptz` not null, default `now()` | Token timestamps. |

### `user_entitlements`

A migrated table with no active runtime purchases behavior.

| Column | Type / Constraints | Purpose |
|---|---|---|
| `user_id` | `char(10)` PK part, FK to `users.id` with cascading delete | Entitlement owner. |
| `game_id` | `text` PK part | Migrated entitlement/game identifier column. |
| `store` | `text` not null | Store marker. |
| `original_transaction_id` | `text` not null | Store transaction identity. |
| `created_at`, `updated_at` | `timestamptz` not null, default `now()` | Record timestamps. |

## Indexes

The committed migrations define primary-key indexes plus uniqueness indexes on
`users.provider_id`, `refresh_tokens.token_hash`,
`user_rivals(user_id1, user_id2, game_id)`, and `graves.provider_id`. They do
not define additional lookup or cleanup indexes.

## Material Drift

The current source and committed migration are not fully aligned:

| Area | Migration Truth | Source/Runtime Impact |
|---|---|---|
| Entitlements | Migrated key column is named `game_id`; no gift column/relation exists. | The entity describes an entitlement identifier and a `gift_id` relation not represented in the migration. No active purchases path currently exercises it. |
| Gifts | No `user_gifts` table is created by the committed migration. | A source entity exists, but no migrated storage is available for it. |

These are schema/runtime concerns to resolve in code and migrations; behavior
documents must not present the unmatched entity shapes as live storage.

## Redis Keys

| Key Pattern | Data | Lifetime / Mutation Rule |
|---|---|---|
| `invite:code:{inviteCode}` | JSON invitation containing game, creator, player slot, private flag, invitee user IDs, options, and creation time. | 24 hours; deleted on join/cancel/account cleanup. |
| `invite:claim:{inviteCode}` | Caller ID for an in-progress join, friend invite, cancel, rollback, or received-invite delete operation. | 30 seconds; set with `NX` during claimed invite mutations, deleted after successful cleanup or released when the operation fails before consuming the invite. |
| `invite:user:{userId}` | Sorted-set index of invitation codes created by a user. | 24 hours from each write; expired members are pruned on relevant reads/creation and key deleted during account cleanup. |
| `invite:received:{userId}` | Sorted-set index of invitation codes sent to a user, scored by invite expiry time. | 24 hours from each write; expired members are pruned on read and members are removed on recipient delete, sender rollback, join, cancel, or account cleanup. |
| `match:meta:{matchId}` | JSON players, game ID, and lifecycle status for realtime lookup. | Written with finite TTL; current write paths set either 24 hours or 30 days; deleted on completion/abandonment cleanup. |
| `match:state:{matchId}` | JSON plugin state used while active interactions occur. | 1 hour from each write; flushed to PostgreSQL at session boundaries and removed on match finalization. |
| `match:user:{userId}` | ID of the match currently opened by a user. | No expiry; removed on close/disconnect/account cleanup. |
| `match:replay:{matchId}:{userId}` | JSON per-player replay `{ initialView, steps }`. | 7 days from write; consumed on open and removed on abandonment. |
| `ws:ticket:{ticket}` | User ID for one-use WebSocket authentication. | 60 seconds or first successful use. |
| `ws:throttle:{event}:{userId}` | Event-specific message counter. | Fixed event window, currently 60 seconds. |

The state ownership and transition rules using these stores are documented in
[Match Runtime](systems/match-runtime.md).
