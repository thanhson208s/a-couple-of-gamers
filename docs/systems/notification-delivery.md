# Notification Delivery

**Status:** Partially implemented

## Responsibility and Boundaries

This system describes server-side push delivery through Firebase Cloud
Messaging (FCM) and the current availability of turn reminders. It does not
define client permission handling or UI behavior.

| Concern | State or Effect Owner | Current Availability |
|---|---|---|
| Stored device-token associations | PostgreSQL device-token state; shape is in [Database Schema](../database-schema.md). | Authenticated HTTP registration and removal are active. |
| Push send and invalid-token cleanup | Notification service using FCM. | Wired when a friend match invitation initiates a push attempt. |
| Realtime friend-invite delivery | Match/WebSocket flow. | Wired separately from push for connected users. |
| Turn reminder jobs | Reminder queue and worker. | Scheduling and delivery are incomplete. |

## Active Behavior

For stored FCM device tokens, push delivery sends multicast messages to all
tokens for the target user. If FCM reports that a registration token is no
longer registered, the failed token is deleted.

Authenticated clients can register or remove their own stored device tokens
through the notification interfaces listed in the
[API Reference](../api-reference.md#notifications).

### Friend Invitation Delivery

The currently wired push trigger is a still-pending match invitation shared
with an accepted friend.

| Stage | Behavior |
|---|---|
| Authorization and invite lookup | The match flow confirms that the invitation exists, belongs to the caller, and the recipient is an accepted friend. |
| Push attempt | The server looks up all stored tokens for the friend. With no tokens, push completes with no message; with tokens, it sends an FCM notification plus invitation data to all devices. |
| Invalid-token cleanup | A send response identifying a no-longer-registered token removes that stored token association. Other send failures do not automatically remove a token. |
| Realtime attempt | After the awaited push attempt completes, the match flow sends `friend:invite` if the recipient has an active socket. |

The notification attempt does not consume or reserve the pending match
invitation; join, cancel, and expiry continue to determine its validity. Push
is not durable delivery of the realtime event. If the FCM send operation
throws, the invitation remains pending, but the invitation request fails
before its realtime send is attempted.

The persisted token shape is documented in
[Database Schema](../database-schema.md). The live match invitation interface
is documented in [API Reference](../api-reference.md).

## Incomplete Runtime Paths

| Path | Current State | Observable Consequence |
|---|---|---|
| Turn reminder scheduling | Queue-writing support exists, and account-deletion match cleanup attempts to cancel reminder job identities, but action processing never schedules those jobs. | Match play creates no reminder notification work. |
| Turn reminder processing | The worker registers a reminder processor without a delivery effect. | Even externally queued reminder work does not send a push notification. |

## Client Behavior Placeholder

First-party client behavior for permission requests, token registration or
removal, incoming push handling, and invitation deep-link routing has not been
implemented or verified in this repository.
