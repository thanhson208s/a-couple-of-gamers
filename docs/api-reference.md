# API Reference

> **[DRAFT — pending approval]** These endpoints are proposals. Review and confirm before implementation.

All `/v1/` REST endpoints (auth, games, matches, moves, invites, users, favorites) and WebSocket events with payloads.

---

## Versioning

All routes are prefixed with `/v1/`. When breaking changes are required, a `/v2/` prefix will be introduced while `/v1/` is maintained for a TBD sunset period. Old mobile clients that cannot be force-updated continue to function until sunset.

Clients should send their version in a header: `X-Client-Version: <semver>`. The server may reject clients below a minimum supported version with `426 Upgrade Required`.

---

## Auth Conventions

Authenticated requests (both social and guest) use:
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
| `POST` | `/v1/auth/guest` | Issue guest JWT. Body: `{ guestId: <uuid> }`. Returns access + refresh tokens with `type:'guest'` claim. |
| `POST` | `/v1/auth/social` | Verify a Firebase ID token and return access + refresh tokens. Body: `{ idToken }`. If `Authorization: Bearer <guest-jwt>` is present, guest data is merged into the new account. |
| `POST` | `/v1/auth/refresh` | Exchange refresh token for new access token. Body: `{ refreshToken }` |
| `POST` | `/v1/auth/ws-ticket` | Issue a short-lived one-time WS ticket. Requires valid JWT. |

---

### Games

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/games/:slug` | Get single game details including bundle metadata |

---

### Favorites

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/users/me/favorites` | List favorited games (requires JWT) |
| `PUT` | `/v1/users/me/favorites/:gameSlug` | Add game to favorites |
| `DELETE` | `/v1/users/me/favorites/:gameSlug` | Remove game from favorites |

---

### Matches

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/matches` | Create a new human match. Body: `{ gameSlug, playerSlot: 1\|2, options? }`. `options` is a game-specific object (e.g. difficulty, selected roles) — stored on the match and passed to `plugin.initialState` when the second player joins. Creator occupies the chosen slot; joiner fills the other. Response: `{ id, inviteCode, deepLink, expiresAt }`. vs AI matches are client-only — no server record created. |
| `GET` | `/v1/matches` | List caller's active matches (pending + in-progress) |
| `GET` | `/v1/matches/:id` | Get match state (returns caller's player view) |
| `POST` | `/v1/matches/join` | Join a pending match by invite code. Body: `{ inviteCode }`. No match ID needed — server looks up match by code. Code is cleared on join. Returns `410` if expired, `409` if match no longer pending, `403` if own match. |
| `DELETE` | `/v1/matches/:id` | Abandon / forfeit a match |

---

### Moves

Human match moves are submitted via WebSocket only — see [WebSocket Events](#websocket-events) below.

---

### Invites

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/matches/:id/invite` | Re-fetch invite code + deep link for a pending match (reshare use case only — initial link is returned by `POST /v1/matches`) |

---

### Users

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/users/me` | Get current user profile. Response includes `id` — a 10-char server-generated alphanumeric identifier used in friend requests and player views. |
| `PUT` | `/v1/users/me/device-token` | Register or update FCM device token. Body: `{ token, platform: 'ios'|'android' }` |
| `DELETE` | `/v1/users/me` | Delete account and all associated data. See [requirements.md#account-deletion](requirements.md#account-deletion). |
| `GET` | `/v1/users/me/rivals` | List all opponents with at least one completed match |
| `GET` | `/v1/users/me/rivals/:opponentId` | Get rival stats vs a specific opponent (`:opponentId` is the opponent's `tag`), broken down by game |

---

### Config

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/config` | Returns app config merged with game catalog. No auth required. Each entry under `games` includes config fields (`enabled`) and bundle metadata (`bundleUrl`, `bundleVersion`, `bundleSizeBytes`, `isPreinstalled`). |

---

### Matches (AI Completion)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/matches/:id/complete` | Report the result of an offline AI match. Body: `{ winnerId: string \| null }`. Server records without re-validating. Requires valid auth (guest or JWT). |

---

### Admin

All admin endpoints require `X-Admin-Token: <token>` header.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/admin/config` | Get full current config for the admin dashboard |
| `PUT` | `/v1/admin/config` | Replace config. Body: full config object |

---

### Dev (local only)

All dev endpoints require `DEV_MODE=true` and `CF_TEAM_DOMAIN` unset. Return `404` otherwise — see [security.md#dev-mode-local-only](security.md#dev-mode-local-only).

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/dev` | Dev console — interactive HTML page for testing pre-game flows. No `/v1/` prefix. |
| `POST` | `/v1/auth/dev` | Sign in as any user by `accountId`. Creates the user if not found. Body: `{ accountId }`. Returns `{ accessToken, refreshToken }`. |
| `GET`  | `/v1/dev/cheat/ping` | Health check confirming dev mode is active. Returns `{ ok: true, mode: 'dev' }`. |
| `POST` | `/v1/dev/cheat/matches/:id/force-complete` | Force a match to completed status. Body: `{ winner: 0\|1\|2 }` (0=draw). |

---

## WebSocket Events

Connection: `wss://<host>/v1/ws?ticket=<ws-ticket>`  
Hosts: `acog.gootube.online` (production), `acoq.gootube.online` (staging)  
Authentication: use a short-lived WS ticket obtained from `POST /v1/auth/ws-ticket`. See [security.md#websocket-authentication](security.md#websocket-authentication).

The connection is **user-scoped and persistent** — opened once after login. All match events for all of the user's active matches arrive over this single connection. Each event includes `matchId` so the client can route it to the correct scene. Player identifiers in all events are `tag` values, not internal UUIDs.

### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `open_match` | `{ matchId }` | Client entered a match board scene. Server registers match-viewing presence and notifies opponent. |
| `close_match` | `{ matchId }` | Client left a match board scene. Server removes viewing presence and notifies opponent. |
| `move` | `{ matchId, move: <game-specific> }` | Submit a move. Server validates, writes state, then broadcasts or sends FCM. |
| `ping` | — | Keepalive |

### Server → Client

All events include `matchId`.

| Event | Payload | Description |
|-------|---------|-------------|
| `match:state` | `{ matchId, view: <player-view>, matchStatus }` | Sent after every valid move; each player receives their own view |
| `match:move_error` | `{ matchId, code, message }` | Sent to the submitting player when a move is invalid |
| `match:over` | `{ matchId, winner: playerId \| null, finalView }` | Game ended (win/draw/forfeit) |
| `opponent_connected` | `{ matchId, playerId }` | Opponent opened this match's board scene |
| `opponent_disconnected` | `{ matchId, playerId }` | Opponent closed this match's board scene or disconnected |
| `pong` | — | Keepalive response |
