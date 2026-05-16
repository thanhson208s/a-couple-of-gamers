# API Reference

All `/v1/` REST endpoints and WebSocket events with payloads.

---

## Versioning

All routes are prefixed with `/v1/`. When breaking changes are required, a `/v2/` prefix will be introduced while `/v1/` is maintained for a TBD sunset period. Old mobile clients that cannot be force-updated continue to function until sunset.

Clients should send their version in a header: `X-Client-Version: <semver>`. The server may reject clients below a minimum supported version with `426 Upgrade Required`.

---

## Auth Conventions

Authenticated requests use:
- `Authorization: Bearer <access-token>`

Error response shape (all endpoints):
```json
{ "error": "string description", "code": "MACHINE_READABLE_CODE" }
```

---

## REST Endpoints

### Auth

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/auth/login` | Verify a Firebase ID token and return access + refresh tokens. Body: `{ idToken }`. Works for both anonymous (`signInAnonymously`) and social (`google.com`, `apple.com`, `facebook.com`) Firebase users. Returns `type:'anonymous'` or `type:'social'` depending on the Firebase `sign_in_provider`. If the Firebase UID matches an existing anonymous user and the token is now a social provider, the record is upgraded in-place. |
| `POST` | `/v1/auth/refresh` | Exchange refresh token for new access token. Body: `{ refreshToken }` |
| `POST` | `/v1/auth/logout` | Invalidate a refresh token. Body: `{ refreshToken }` |

---

### WebSocket Ticket

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/ws/ticket` | Issue a short-lived one-time WS ticket. Requires valid JWT. Returns `{ ticket }`. |

---

### Games

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/games` | List all games. Returns array of `{ id, slug, name, status }`. |
| `GET` | `/v1/games/:slug` | Get single game row: `{ id, slug, name, status }`. Bundle version + URL are not here — they live in `game-bundles/<env>/manifest.json` on R2 (see [hot-update.md#source-of-truth](hot-update.md#source-of-truth)). Metadata (display name, icons, banners, intro/rule images) also not returned — it ships with the client catalog via [hot-update.md](hot-update.md). |

---

### Favorites

Requires JWT.

| Method | Path | Description |
|--------|------|-------------|
| `PUT` | `/v1/users/favorites/:gameId` | Add game to favorites |
| `DELETE` | `/v1/users/favorites/:gameId` | Remove game from favorites |

---

### Matches

All endpoints require JWT.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/matches` | Create a new human match. Body: `{ gameSlug, playerSlot: 1\|2, options? }`. Stores pending match in Redis with 24 h TTL — no Postgres write yet. Returns `{ inviteCode, deepLink, expiresAt }`. vs AI matches are client-only — no server record created. |
| `GET` | `/v1/matches/pending` | List caller's pending matches (from Redis). Each item: `{ status, inviteCode, deepLink, expiresAfter, playerSlot, gameId, createdAt }`. |
| `GET` | `/v1/matches/active` | List caller's active matches (from Postgres). Each item: `{ match: { id, status, gameId, player1Id, player2Id }, nextTurns }`. |
| `GET` | `/v1/matches/history` | List caller's last 10 completed matches (from Postgres), ordered by `updatedAt` DESC. |
| `POST` | `/v1/matches/join` | Join a pending match by invite code. Body: `{ inviteCode }`. Reads from Redis, deletes Redis keys, creates Postgres `active` match. Returns `404` if code not found or expired, `403` if own match. Both players receive `match:start` over WebSocket. |
| `POST` | `/v1/matches/pending/:inviteCode/invite/:friendId` | Send a friend a match invitation via push notification and `friend:invite` WS event. Returns `204`. `403` if not your invite or not a friend. |
| `DELETE` | `/v1/matches/pending/:inviteCode` | Cancel a pending match. Creator only. Deletes from Redis — no Postgres record exists. Returns `404` if not found, `403` if not the creator. |
| `DELETE` | `/v1/matches/:id` | Abandon an active match. Either player. Both players receive `match:over` over WebSocket. Returns `404` if not found, `403` if not a player. |

---

### Users

All endpoints require JWT.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/users/profile` | Get current user profile. Response includes `id` — a 10-char server-generated alphanumeric identifier used in friend requests and player views. |
| `DELETE` | `/v1/users/profile` | Delete account and all associated data. Body: `{ idToken }`. See [requirements.md#account-deletion](requirements.md#account-deletion). |
| `GET` | `/v1/users/stats` | Get current user's overall match stats. |
| `GET` | `/v1/users/rivals/:opponentId` | Get rival stats vs a specific opponent (`:opponentId` is the opponent's `tag`), broken down by game. |
| `GET` | `/v1/users/friends` | List all accepted friends. |
| `GET` | `/v1/users/friends/requests` | List incoming pending friend requests. |
| `POST` | `/v1/users/friends/:addresseeId` | Send a friend request. Returns `204`. Sends `friend:request` WS event to addressee. |
| `PUT` | `/v1/users/friends/:requesterId` | Accept a friend request. Returns `204`. Sends `friend:accept` WS event to requester. |
| `DELETE` | `/v1/users/friends/:addresseeId/cancel` | Cancel a sent friend request. Returns `204`. |
| `DELETE` | `/v1/users/friends/:requesterId/delete` | Reject a received friend request. Returns `204`. |
| `DELETE` | `/v1/users/friends/:friendId` | Remove an accepted friend. Returns `204`. |

---

### Notifications

All endpoints require JWT.

| Method | Path | Description |
|--------|------|-------------|
| `PUT` | `/v1/notifications/fcm-token` | Register or update FCM device token. Body: `{ token, platform: 'ios'\|'android' }`. Returns `204`. |
| `DELETE` | `/v1/notifications/fcm-token` | Remove an FCM device token. Body: `{ token }`. Returns `204`. |

---

### Config

Requires JWT.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/config` | Returns app config. Each entry under `games` is `{ status }` — a numeric enum: `0` under maintenance, `1` coming soon, `2` enabled, `3` disabled. Clients hide `3` and block Play for `0` / `1`. Bundle version + URL per slug come from `game-bundles/<env>/manifest.json` on R2 (see [hot-update.md#source-of-truth](hot-update.md#source-of-truth)) — fetched by the client in parallel with this endpoint. Cached at Cloudflare for up to 5 minutes. |

---

### Admin

All admin endpoints require `X-Admin-Token: <token>` header.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/admin/config` | Get full current config for the admin dashboard |
| `PUT` | `/v1/admin/config` | Replace config. Body: full config object |
| `PUT` | `/v1/admin/games/:slug` | Update game. Body: `{ name?, status?: 0 \| 1 \| 2 \| 3 }` (0=under_maintenance, 1=coming_soon, 2=enabled, 3=disabled). Returns the updated row. 404 if slug unknown. |

---

### Purchases

Requires RevenueCat webhook signature (`RcAuthGuard`).

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/purchases/rc-webhook` | Receive RevenueCat webhook events. Handles `TEST`, `INITIAL_PURCHASE`, `NON_RENEWING_PURCHASE`, `PRODUCT_CHANGE`, `CANCELLATION`, `EXPIRATION`, and `TRANSFER` event types. Returns `204`. |

---

### Dev (local only)

All dev endpoints require `NODE_ENV=development`. Return `404` otherwise — see [security.md#dev-mode-local-only](security.md#dev-mode-local-only).

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/v1/dev/ping` | Health check confirming dev mode is active. Returns `{ ok: true, message: string }`. |
| `POST` | `/v1/dev/auth` | Sign in as any user by `accountId`. Creates the user if not found. Body: `{ accountId }`. Returns `{ accessToken, refreshToken }`. |
| `POST` | `/v1/dev/matches/complete` | Force a match to completed status. Body: `{ matchId: string; winner: 0\|1\|2 }` (0=draw). |

---

## WebSocket Events

Connection: `wss://<host>/v1/ws?ticket=<ws-ticket>`  
Hosts: `api.acoupleofgamers.com` (production), `api.staging.acoupleofgamers.com` (staging)  
Authentication: use a short-lived WS ticket obtained from `POST /v1/ws/ticket`. See [security.md#websocket-authentication](security.md#websocket-authentication).

The connection is **user-scoped and persistent** — opened once after login. All match events for all of the user's active matches arrive over this single connection. Each event includes `matchId` so the client can route it to the correct scene. Player identifiers in all events are `tag` values, not internal UUIDs.

All messages use the envelope `{ event: string, data: object }` for client → server, and `{ event: string, ...payload }` for server → client.

### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `match:open` | `{ matchId }` | Client entered a match board scene. Server registers match-viewing presence, sends `match:open` back with current state, and notifies opponent via `opponent:connected`. |
| `match:close` | `{ matchId }` | Client left a match board scene. Server flushes state to DB, removes viewing presence, sends `match:close` back, and notifies opponent via `opponent:disconnected`. |
| `match:action` | `{ matchId, action }` | Submit a game action. `action` is game-specific. On error the server replies with `{ error: <http-code>, event: 'match:action' }`. On success, state changes are pushed as `match:moves` (or `match:turns` if offline) to both players. |
| `ping` | — | Keepalive |

### Server → Client

Match events all include `matchId`. System and social events do not (unless noted).

| Event | Payload | Description |
|-------|---------|-------------|
| `match:start` | `{ inviteCode, initialView, nextTurns, match: { id, status, gameId, player1Id, player2Id } }` | Sent to both players when the second player joins via invite code. |
| `match:open` | `{ match: { id, status, gameId, player1Id, player2Id }, view, replay: { initialView, steps } \| null }` | Sent back to the caller of `match:open`. `replay` is non-null if the player has buffered moves from while they were offline (each step: `{ move, view, playerIndex }`). For completed/abandoned matches, `view` reflects the final state. |
| `match:close` | `{ matchId }` | Sent back to the caller of `match:close` confirming the session was closed. |
| `match:moves` | `{ matchId, steps: [{ move, view, playerIndex }], nextTurns }` | Sent to each online player after an action is applied. `playerIndex` in each step indicates who made the move (1 or 2). Each player receives their own view. |
| `match:turns` | `{ matchId, nextTurns }` | Sent to an offline player (not currently in the match scene) when a move is applied. The full move sequence is buffered and delivered via `match:open.replay` when they re-enter. |
| `match:over` | `{ match: { id, status, winner, player1Id, player2Id } }` | Game ended (win, draw, or abandonment). `winner` is `1`, `2`, or `null` for draw/abandon. |
| `opponent:connected` | `{ matchId, opponentId }` | Opponent opened this match's board scene. |
| `opponent:disconnected` | `{ matchId, opponentId }` | Opponent closed this match's board scene or disconnected. |
| `friend:invite` | `{ inviteCode, deepLink, gameId }` | A friend sent you a match invitation. |
| `friend:request` | `{ userId, displayName, avatarUrl }` | Someone sent you a friend request. |
| `friend:accept` | `{ userId, displayName, avatarUrl }` | Your friend request was accepted. |
| `pong` | — | Keepalive response. |
| `system:maintenance` | `{ maintenanceAfter: number, maintenanceDuration: number }` | Broadcast every minute while maintenance is scheduled. Also sent immediately to any client that connects during the window. `maintenanceAfter` is milliseconds until maintenance starts; `maintenanceDuration` is in seconds. |
| `system:shutdown` | — | Sent to all clients immediately before the server shuts down (SIGTERM). Clients should display a reconnect UI. |
