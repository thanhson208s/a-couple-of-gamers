# Push Notifications

**Requires reading:** [requirements.md#push-notifications](../requirements.md#push-notifications)

---

## Overview

FCM is used for all push notifications. The client registers a device token on login; the server stores it per device per user. Notifications are dispatched inline by the API server (on move submission) or by the worker service (turn reminders). No push is sent when the recipient is already connected via WebSocket.

---

## Device Token Management

- Client calls `PUT /v1/users/me/device-token` after login and on app launch if the OS has rotated the token
- A user can have multiple tokens (multiple devices); all are notified unless the token is stale
- Stale token detection: FCM returns `NOT_REGISTERED` → server deletes that token

## Notification Triggers

| Event | Dispatcher | Condition |
|-------|-----------|-----------|
| Opponent's turn (move submitted) | API server, inline | Opponent not connected via WS |
| Turn reminder | Worker service (BullMQ delayed job) | Player hasn't moved after TBD interval |

## Payload

Notification payloads carry enough data for the client to route directly to the match (e.g. `matchId`). The client opens the match screen on tap without requiring a full app reload.

---

## Related

- Device token endpoint: [api-reference.md#users](../api-reference.md#users)
- Reminder job: [background-workers.md](background-workers.md)
- DB: [database-schema.md#device_tokens](../database-schema.md#device_tokens)
