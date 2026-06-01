# Notification Delivery

**Status:** Partially implemented

## Responsibility and Boundaries

This system describes server-side push delivery through Firebase Cloud
Messaging (FCM) and the current availability of turn reminders. It does not
define client permission handling or UI behavior.

| Concern | State or Effect Owner | Current Availability |
|---|---|---|
| Stored device-token associations | PostgreSQL device-token state; shape is in [Database Schema](../database-schema.md). | Authenticated HTTP registration and removal are active. |
| Push send and invalid-token cleanup | Notification service using FCM. | Wired when a friend match invitation targets an offline friend. |
| Realtime friend-invite delivery | Match/WebSocket flow. | Wired instead of push for connected users. |
| Turn reminder jobs | WebSocket session lifecycle, active match turn state, reminder queue, and worker. | Active when the worker process is running and the recipient has stored FCM tokens. |

## Active Behavior

For stored FCM device tokens, push delivery sends multicast messages to all
tokens for the target user. If FCM reports that a registration token is no
longer registered, the failed token is deleted.

Authenticated clients can register or remove their own stored device tokens
through the notification interfaces listed in the
[API Reference](../api-reference.md#notifications).

### Friend Invitation Delivery

The currently wired friend-invite trigger is a still-pending match invitation
shared with an accepted friend.

| Stage | Behavior |
|---|---|
| Authorization and invite lookup | The match flow confirms that the invitation exists, belongs to the caller, and the recipient is an accepted friend. The friend is added to the invite's `invitees` list and recipient invite index before delivery is attempted. |
| Delivery branch | If the friend has an active WebSocket connection, the server sends realtime `friend:invite`. Otherwise, it attempts FCM push delivery. |
| Push attempt | For offline friends, the server looks up all stored tokens. With no tokens, push completes with no message; with tokens, it sends an FCM notification plus invitation data to all devices. |
| Invalid-token cleanup | A send response identifying a no-longer-registered token removes that stored token association. Other send failures do not automatically remove a token. |
| Realtime attempt | For connected friends, the match flow sends `friend:invite` and does not send push. |

The notification attempt does not consume or reserve the pending match
invitation; join, cancel, and expiry continue to determine its validity. Push
and realtime delivery are not durable, so the recipient invite index backs
`GET /v1/matches/invites` for clients to recover missed invitation delivery.
If the FCM send operation throws for an offline friend, the invitation remains
pending and listed for the recipient, but the invitation request fails.

The persisted token shape is documented in
[Database Schema](../database-schema.md). The live match invitation interface
is documented in [API Reference](../api-reference.md).

### Turn Reminder Delivery

Reminder jobs are based on authenticated WebSocket session presence. A user
with an active WebSocket connection has no pending turn reminder jobs. When
that connection disconnects, the server schedules reminders only for active
matches where that user is currently eligible to act.

| Stage | Behavior |
|---|---|
| WebSocket connected | Existing reminder jobs for all of the user's active matches are cancelled. |
| WebSocket disconnected | The server finds the user's active matches, checks the current cached or durable game state, and schedules instant and delayed reminders only for matches where the user is in `nextTurns`. |
| Action accepted | Match action processing updates turn state and realtime/replay delivery. If the opponent is offline and becomes eligible to act next, instant and delayed reminders are scheduled for that opponent. |
| Reminder processing | The worker consumes `instant-reminder` and `delayed-reminder` jobs and sends FCM data containing `{ type, matchId }` plus the configured notification title/body. |
| Match completion or account cleanup | Pending reminder jobs for affected players are cancelled. |

## Client Behavior Placeholder

First-party client behavior for permission requests, token registration or
removal, incoming push handling, and invitation deep-link routing has not been
implemented or verified in this repository.
