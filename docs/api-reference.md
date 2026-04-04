# API Reference

> **[DRAFT — pending approval]** These endpoints are proposals. Review and confirm before implementation.

All `/v1/` REST endpoints (auth, games, matches, moves, invites, users, favorites) and WebSocket events with payloads.

---

## Versioning

All routes are prefixed with `/v1/`. When breaking changes are required, a `/v2/` prefix will be introduced while `/v1/` is maintained for a TBD sunset period. Old mobile clients that cannot be force-updated continue to function until sunset.

Clients should send their version in a header: `X-Client-Version: <semver>`. The server may reject clients below a minimum supported version with `426 Upgrade Required`.

---

## Auth Conventions

All requests must include one of:
- `Authorization: Bearer <access-token>` — logged-in user
- `X-Guest-Id: <uuid>` — guest (device UUID)

Error response shape (all endpoints):
```json
{ "error": "string description", "code": "MACHINE_READABLE_CODE" }
```

---

## REST Endpoints

### Auth

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/auth/social` | Verify a Firebase ID token and return access + refresh tokens. Body: `{ idToken }` |
| `POST` | `/v1/auth/refresh` | Exchange refresh token for new access token. Body: `{ refreshToken }` |
| `POST` | `/v1/auth/ws-ticket` | Issue a short-lived one-time WS ticket. Requires valid JWT. |
| `POST` | `/v1/auth/guest-merge` | Merge guest data into authenticated account. Requires JWT + `X-Guest-Id`. |

---

### Games

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/games` | List all active games in catalog. Response includes bundle metadata: `bundleUrl`, `bundleVersion`, `bundleSizeBytes`, `isPreinstalled` |
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
| `POST` | `/v1/matches` | Create a new match. Body: `{ gameSlug, opponentType: 'human'|'ai' }` |
| `GET` | `/v1/matches` | List caller's active matches (pending + in-progress) |
| `GET` | `/v1/matches/:id` | Get match state (returns caller's player view) |
| `POST` | `/v1/matches/:id/join` | Accept an invite and join a pending match. Body: `{ inviteCode }` |
| `DELETE` | `/v1/matches/:id` | Abandon / forfeit a match |

---

### Moves

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/matches/:id/moves` | Submit a move. Body: game-specific `move` object. Returns updated player view. Used by both human (async path) and AI clients. |

_Real-time moves are submitted via WebSocket — see below._

---

### Invites

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/matches/:id/invite` | Get or generate invite code + deep link for a pending match |

---

### Users

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/users/me` | Get current user profile |
| `PUT` | `/v1/users/me/device-token` | Register or update FCM device token. Body: `{ token, platform: 'ios'|'android' }` |
| `DELETE` | `/v1/users/me` | Delete account and all associated data. See [requirements.md#account-deletion](requirements.md#account-deletion). |
| `GET` | `/v1/users/me/rivals` | List all opponents with at least one completed match |
| `GET` | `/v1/users/me/rivals/:opponentId` | Get rival stats vs a specific opponent, broken down by game |

---

### Config

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/config` | Returns current app config (enabled/disabled games, feature flags). No auth required. |

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

## WebSocket Events

Connection: `wss://<host>/v1/matches/:matchId/ws?ticket=<ws-ticket>`  
Hosts: `acog.gootube.online` (production), `acoq.gootube.online` (staging)  
Authentication: use a short-lived WS ticket obtained from `POST /v1/auth/ws-ticket`. See [security.md#websocket-authentication](security.md#websocket-authentication).

### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `move` | `{ move: <game-specific> }` | Submit a move during a real-time session |
| `ping` | — | Keepalive |

### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `state` | `{ view: <player-view>, matchStatus }` | Sent after every valid move to all connected players (each receives their own view) |
| `move_error` | `{ code, message }` | Sent to submitting player when move is invalid |
| `opponent_connected` | `{ playerId }` | Opponent joined the WebSocket session |
| `opponent_disconnected` | `{ playerId }` | Opponent's WebSocket closed |
| `match_over` | `{ winner: playerId | null, finalView }` | Game ended (win/draw/forfeit) |
| `pong` | — | Keepalive response |
