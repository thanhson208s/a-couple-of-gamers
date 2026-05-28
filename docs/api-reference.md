# API Reference

Active application HTTP and WebSocket interfaces. Technical lifecycle context
is documented in [systems/](systems/).

## Conventions

- The application API is prefixed with `/v1`; `GET /health` is the exception.
- Endpoints marked `JWT` require `Authorization: Bearer <access-token>`.
- Administrative endpoints use the authentication mode described in
  [Security](security.md#admin-authentication).
- REST errors currently use NestJS default exception/validation response
  formats; there is no application-wide `{ error, code }` contract.

## Shared Shapes

The endpoint and WebSocket tables use these abbreviated shapes:

```text
MatchSummary = { id, status, gameId, player1Id, player2Id }
MatchResult  = { id, status, winner, player1Id, player2Id }
MatchStep    = { move, view, playerIndex }
Replay       = { initialView, steps: MatchStep[] } | null
```

`status` values for a durable match are `active`, `completed`, and
`abandoned`. Pending invitations are Redis-backed invitation values rather
than durable match rows. For the currently registered competitive game,
`winner` is `0` for a draw, `1` or `2` for the winning player slot, and
`null` for abandonment.

## HTTP Endpoints

### Health

| Method | Path | Auth | Response / Behavior |
|---|---|---|---|
| `GET` | `/health` | None | Probes PostgreSQL and Redis. Returns `200` with `{ status: "ok", db: "ok", cache: "ok" }` when both probes pass. Returns `503` with `{ status: "error", db, cache }` when either dependency probe fails; failed dependencies are reported as `"error"`. |

### Authentication

| Method | Path | Auth | Request / Response |
|---|---|---|---|
| `POST` | `/v1/auth/login` | None | Body `{ idToken: string }`; verifies Firebase ID token and returns `{ accessToken, refreshToken }`. |
| `POST` | `/v1/auth/refresh` | None | Body `{ refreshToken: string }`; rotates an active refresh token and returns `{ accessToken, refreshToken }`. |
| `POST` | `/v1/auth/logout` | None | Body `{ refreshToken: string }`; revokes the matching active token if present. |

### WebSocket Connection Ticket

| Method | Path | Auth | Response / Behavior |
|---|---|---|---|
| `POST` | `/v1/ws/ticket` | JWT | Returns a ticket string. The ticket is single-use and expires after 60 seconds. |

### Games and Configuration

| Method | Path | Auth | Response / Behavior |
|---|---|---|---|
| `GET` | `/v1/games` | None | Returns all catalog game rows `{ id, name, status }[]`. |
| `GET` | `/v1/games/:slug` | None | Returns the matching catalog row `{ id, name, status }` or `null`. |
| `GET` | `/v1/config` | JWT | Returns `{ appVersion?, featureLimits, games }`, where `games` maps game ID to `{ status }`; response has a five-minute public cache header. |

Game `status` is serialized numerically: `0` is `under_maintenance`, `1` is
`coming_soon`, `2` is `enabled`, and `3` is `disabled`.

See [Game Catalog and Configuration](systems/game-config.md)
for catalog/runtime responsibilities.

### Users and Social State

All routes in this section require `JWT`.

| Method | Path | Response / Behavior |
|---|---|---|
| `GET` | `/v1/users/profile` | Returns `{ id, provider, displayName, avatarUrl, favorites: string[], favoritesLimit }`. |
| `DELETE` | `/v1/users/profile` | Body `{ idToken: string }`; deletes the authenticated account after recent Firebase reauthentication validation; no response payload. |
| `PUT` | `/v1/users/favorites/:gameId` | Adds a favorite subject to limits; idempotent for an existing favorite; no response payload. |
| `DELETE` | `/v1/users/favorites/:gameId` | Removes a favorite; idempotent; no response payload. |
| `GET` | `/v1/users/stats` | Returns `{ gameId, matchCount, winCount, lossCount, drawCount }[]` aggregated by game. |
| `GET` | `/v1/users/rivals/:opponentId` | Returns stored `{ userId1, userId2, gameId, matchCount, winCount, lossCount, drawCount }[]` against that user ID. |
| `GET` | `/v1/users/friends` | Returns `{ id, displayName, avatarUrl }[]` for accepted friends. |
| `GET` | `/v1/users/friends/requests` | Returns `{ sent, received }`, with each list containing `{ friendId, displayName, avatarUrl }` pending request projections. |
| `POST` | `/v1/users/friends/:addresseeId` | Creates a pending friend request and returns `204`. |
| `PUT` | `/v1/users/friends/:requesterId` | Accepts an incoming pending request and returns `204`. |
| `DELETE` | `/v1/users/friends/:addresseeId/cancel` | Cancels an outgoing request and returns `204`. |
| `DELETE` | `/v1/users/friends/:requesterId/delete` | Rejects an incoming request and returns `204`. |
| `DELETE` | `/v1/users/friends/:friendId` | Removes an accepted friendship and returns `204`. |

See [Identity and Social State](systems/identity-social.md).

### Notifications

All routes in this section require `JWT`.

| Method | Path | Request / Response / Behavior |
|---|---|---|
| `PUT` | `/v1/notifications/fcm-token` | Body `{ token: string, platform: string }`; registers or reassigns a device token to the caller and returns `204`. |
| `DELETE` | `/v1/notifications/fcm-token` | Body `{ token: string }`; removes the caller's matching stored device token if present and returns `204`. |

See [Notification Delivery](systems/notification-delivery.md) for push
trigger and reminder availability.

### Matches

All routes in this section require `JWT`.

| Method | Path | Request / Response / Behavior |
|---|---|---|
| `POST` | `/v1/matches` | Body `{ gameSlug, playerSlot: 1 \| 2, options? }`; creates a pending invite and returns `{ inviteCode, deepLink, expiresAt }`. |
| `GET` | `/v1/matches/pending` | Returns `{ status: "pending", inviteCode, deepLink, expiresAfter, playerSlot, gameId, createdAt }[]` for invitations created by the caller. |
| `GET` | `/v1/matches/active` | Returns `{ match: MatchSummary, nextTurns }[]` for non-stale active matches. |
| `GET` | `/v1/matches/history` | Returns up to ten completed durable match records, including stored state/options/result/timestamps, newest update first. |
| `POST` | `/v1/matches/join` | Body `{ inviteCode }`; joins a pending invite, emits `match:start`, and returns no response payload. |
| `POST` | `/v1/matches/pending/:inviteCode/invite/:friendId` | Sends an accepted friend an invitation attempt and returns `204`. |
| `DELETE` | `/v1/matches/pending/:inviteCode` | Cancels a caller-owned pending invitation; no response payload. |
| `DELETE` | `/v1/matches/:id` | Abandons a match containing the caller, emits `match:over`, and returns no response payload. |

See [Match Runtime](systems/match-runtime.md) for transitions and state
ownership.

Material match failures:

| Operation | Failure Conditions |
|---|---|
| Create pending invitation | `404` when a game is not currently eligible for creation or the user is absent; `400` when registered game logic cannot be obtained; `403` when the concurrent match limit is reached. |
| Join invitation | `404` for a missing/expired invite; `403` when joining the caller's own invite. |
| Invite friend | `404` for a missing invite; `403` when the caller does not own the invite or the target is not an accepted friend. |
| Cancel invitation | `404` for a missing invite; `403` when the caller is not the creator. |
| Abandon match | `404` for a missing match; `403` for a non-participant; `400` for an already completed match. |

### Administration

| Method | Path | Auth | Request / Response / Behavior |
|---|---|---|---|
| `GET` | `/v1/admin/config` | Admin | Returns `{ appVersion?, featureLimits, games }`, the current effective configuration with the game-status map. |
| `PUT` | `/v1/admin/config` | Admin | Body `{ appVersion, featureLimits }`; replaces the stored configuration and returns no response payload. |
| `PUT` | `/v1/admin/games/:slug` | Admin | Body `{ name?, status? }`; returns updated `{ id, name, status }` or `404` for an unknown slug. |
| `GET` | `/v1/admin/maintenance` | Admin | Returns the active `{ maintenanceAfter, maintenanceDuration }` announcement, or `null` when none is active. |
| `PUT` | `/v1/admin/maintenance` | Admin | Body `{ maintenanceAfter, maintenanceDuration }`, both positive integer millisecond values. Stores the announcement, broadcasts `system:maintenance`, and returns `{ maintenanceAfter, maintenanceDuration }`. |
| `DELETE` | `/v1/admin/maintenance` | Admin | Clears the active announcement, broadcasts `system:maintenance:clear`, and returns `204`. |

### Development Endpoints

These routes are available only when `NODE_ENV=development` and
`CF_TEAM_DOMAIN` is not configured; otherwise they return `404`.

| Method | Path | Request / Response / Behavior |
|---|---|---|
| `GET` | `/v1/dev/ping` | Returns `{ ok: true, message: string }`. |
| `POST` | `/v1/dev/auth` | Body `{ accountId: string }`; returns `{ accessToken, refreshToken }`. |
| `POST` | `/v1/dev/matches/complete` | Body `{ matchId, winner }`; currently returns `501 Not Implemented`. |

## WebSocket Protocol

Connect to `/v1/ws?ticket=<ticket>` using a ticket obtained from
`POST /v1/ws/ticket`. The connection is user-scoped. See
[Security](security.md#websocket-authentication).

### Message Envelopes

| Direction / Kind | Shape |
|---|---|
| Client domain message | `{ "event": "<name>", "data": { ... } }` |
| Server domain message | `{ "event": "<name>", "data": { ... } }` |
| Server handler/throttle error | `{ "event": "<request-event>", "error": <http-status-number> }` |
| Server control message | Event-specific top-level object, such as `{ "event": "pong" }`. |

Unknown events and malformed JSON are ignored. `ping` bypasses event
throttling; other registered events are rate-limited as described in
[Security](security.md#rate-limiting).

### Client to Server Events

| Event | Data | Behavior |
|---|---|---|
| `match:open` | `{ matchId }` | Opens the user's presence in a match and requests current visible state and any buffered replay. |
| `match:close` | `{ matchId }` | Closes presence in a match and flushes cached state. |
| `match:action` | `{ matchId, action }` | Applies a game-specific action for an open active match. |
| `ping` | Not used | Receives `pong`. |

### Server to Client Domain Events

Payloads below are inside the `data` property of the domain envelope.

| Event | Data | Emitted When |
|---|---|---|
| `match:start` | `{ inviteCode, initialView, nextTurns, match: MatchSummary }` | A pending invite is joined. |
| `match:open` | `{ match: MatchSummary, view, replay: Replay }` | A user opens a match. |
| `match:close` | `{ matchId }` | A current open match is closed. |
| `match:moves` | `{ matchId, steps: MatchStep[], nextTurns }` | Visible state transitions are available to a user viewing the match. |
| `match:turns` | `{ matchId, nextTurns }` | State changed while the recipient is not viewing the match. |
| `match:over` | `{ match: MatchResult }` | A match completes or is abandoned. |
| `opponent:connected` | `{ matchId, opponentId }` | Reports that the identified opponent currently has this match open: sent to the other participant when one opens, and sent back to the opener only when both participants now have it open. |
| `opponent:disconnected` | `{ matchId, opponentId }` | A participant closes or disconnects from the open match. |
| `friend:invite` | `{ inviteCode, deepLink, gameId }` | A friend invitation is issued to a connected target. |
| `friend:request` | `{ userId, displayName, avatarUrl }` | A connected target receives a friend request. |
| `friend:accept` | `{ userId, displayName, avatarUrl }` | A connected requester has a request accepted. |

### Server Control Events

| Event | Shape | Emitted When |
|---|---|---|
| `pong` | `{ event: "pong" }` | Response to `ping`. |
| `system:maintenance` | `{ event: "system:maintenance", maintenanceAfter, maintenanceDuration }` | An administrator sets an active maintenance announcement, or a user connects while one is active. |
| `system:maintenance:clear` | `{ event: "system:maintenance:clear" }` | An administrator clears the active maintenance announcement. |
| `system:shutdown` | `{ event: "system:shutdown" }` | Application shutdown closes existing sockets. |

## Unavailable Interface Categories

The running application exposes no active purchase webhook behavior.
