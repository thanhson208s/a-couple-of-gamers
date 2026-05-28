# Match Runtime

**Status:** Partially implemented

## Responsibility and Boundaries

This system owns human match invitations, active match processing, player
presence within a match, per-player state delivery, result recording, and
match cleanup behavior. Protocol shapes are listed in the
[API Reference](../api-reference.md), authentication is defined in
[Security](../security.md), and state locations are cataloged in
[Database Schema](../database-schema.md).

| Concern | Match Runtime Responsibility | Related Owner |
|---|---|---|
| Match eligibility | Apply enabled-game/plugin and concurrent-match-limit checks when creating a pending invite. | Availability and limits originate in [Game Catalog and Configuration](game-config.md). |
| Active gameplay | Coordinate the plugin, cached state, durable state, and per-user realtime delivery. | Game-specific decisions are supplied through the plugin contract. |
| Result effects | Complete or abandon durable matches and coordinate result/stat cleanup effects. | Rival-stat interpretation is described in [Identity and Social State](identity-social.md). |
| Friend invite delivery | Authorize an invitation against accepted friendship and initiate push/realtime delivery. | Push availability is described in [Notification Delivery](notification-delivery.md). |

## Lifecycle

| State | Source of Record | Entry and Exit Behavior |
|---|---|---|
| Pending invite | Redis | Created only for an enabled game with registered logic and available creator capacity. It expires after 24 hours, can be cancelled by its creator, or can be consumed when another user joins it. |
| Active match | PostgreSQL, with Redis as the active-state fast path | Created on join using plugin initial state and assigned player slots. It remains active until plugin completion or abandonment. |
| Completed match | PostgreSQL | Entered when processing an action makes the plugin report game over. The server stores final state/winner and updates rival statistics. |
| Abandoned match | PostgreSQL | Entered when a participating user abandons or deleting an account cleans up its active matches. No completion statistics are recorded. |

Pending invitations do not have PostgreSQL match rows or a designated invitee:
they identify only their creator until someone joins. A joined invitation is
removed from Redis before the active row is created. A persistence failure
during join after invite removal can therefore consume an invitation without
producing an active match.

### Invitation Flow

| Operation | State Check | Effect |
|---|---|---|
| Create pending invite | Game is enabled and executable; creator exists; creator has capacity under its configured pending-plus-active limit. | Writes the expiring invitation and the creator's pending index in Redis and returns shareable invite information. |
| Cancel pending invite | Caller owns the still-present invitation. | Removes its Redis invitation value and creator index entry. |
| Join pending invite | Invite exists and caller is not its creator. | Consumes pending Redis state, initializes a durable active match, caches match metadata, and sends each connected player their own `match:start` view. |
| Invite accepted friend | Caller owns a still-present invitation and target has an accepted friendship with the caller. | Does not alter invitation state; initiates push/realtime delivery described in [Notification Delivery](notification-delivery.md). |

## State Ownership

| State | Authority and Consistency Behavior |
|---|---|
| Match record and final/result state | Durable PostgreSQL data for joined matches. |
| Active state cache | Redis is read and written while an active match is played. PostgreSQL state can lag until close, disconnect, completion, or abandonment causes a flush or final write. |
| Match metadata cache | Redis accelerates participant/game/status lookup; it is removed at completion or abandonment so later reads recover terminal status from PostgreSQL. |
| Open-match presence | Redis records at most one currently open match per user and determines whether actions are applied and whether move steps are delivered immediately. |
| Offline replay | Redis stores a player's visible transitions while that player is not viewing the match. Opening the match consumes replay; abandonment clears it. |

The key layout and expiry rules for Redis-owned state are kept in
[Database Schema](../database-schema.md#redis-keys).

## Realtime Processing

A user obtains a one-use WebSocket ticket over HTTP and opens one
user-scoped WebSocket connection.

### Open and Presence

| Operation | Behavior |
|---|---|
| Socket connect | Authenticates the WebSocket ticket, records the user-scoped socket, dispatches connection handlers, and clears turn reminder jobs for that user's active matches. |
| Open match | Confirms participation; if another match was open, flushes its cached state and reports disconnection to that match's opponent; then records the new open match, obtains the current per-player view, consumes buffered replay, and sends a match-open response. The opponent is notified that the caller opened the match; the caller is told that the opponent is connected only when the opponent already has the same match open. |
| Close current match | Flushes cached state to durable state, clears that user's open-match record, acknowledges close to that user, and reports disconnection to the opponent. |
| Socket disconnect | If the closing socket is still the user's active socket, performs the same state flush and opponent-disconnection reporting for the match recorded as open for that user, then schedules turn reminder jobs for active matches where the disconnected user is eligible to act. |

### Actions and Delivery

| Stage | Behavior |
|---|---|
| Admission | The caller must be a participant in an active match and have that match currently recorded as open. An action for a match not open for the caller is ignored without state change or error. |
| Plugin application | Game logic either rejects the action or returns ordered state transitions exposed through per-player views. |
| State update | When transitions are returned, their final state is written to the Redis active-state cache. If no transitions are returned, the runtime returns without writing state or delivering events. |
| Immediate/offline delivery | A player viewing the match receives visible move steps. A player not viewing it receives a turn update, while visible steps are buffered for its next open. |
| Completion | If final state completes the game, PostgreSQL receives terminal state and winner, active cache/metadata are cleared, rival statistics are applied, and both players receive `match:over`. |

WebSocket event and envelope contracts are specified in the
[API Reference](../api-reference.md#websocket-protocol); authentication and
validation boundaries are specified in [Security](../security.md).

## Cleanup Effects

| Trigger | Match Effect | Associated Cleanup |
|---|---|---|
| Explicit abandonment | Any non-completed joined match containing the caller becomes abandoned. | Cached state is flushed and removed, buffered replay is cleared, and both connected players can receive `match:over`. |
| Account deletion | Invites created by the deleting user are cancelled and its active matches become abandoned before deleting the user row. | Open presence is cleared for that user; cached state/replay is cleared; reminder jobs for both players are cancelled; connected opponents receive `match:over`. |
| Scheduled stale-match cleanup | Deletes aged abandoned rows and inactive active rows, then removes their cached state/metadata. | Invoked by the worker's repeatable cleanup queue job. |

An abandoned match does not update rival statistics. Account deletion cannot
cancel an invite merely addressed to the deleting user because a pending
invite has no joined recipient state.

## Incomplete Runtime Paths

- Newly created Tic-Tac-Toe matches initialize without a player eligible to
  act (`nextTurns` is empty), so submitted normal moves are rejected as not
  belonging to the current turn.

## Client Behavior Placeholder

First-party client behavior for invite/deep-link intake, WebSocket lifecycle,
visible-state application, replay playback, action submission, and
reconnection handling has not been implemented or verified in this repository.
