# Push Notifications

**Requires reading:** [requirements.md#push-notifications](../requirements.md#push-notifications)

---

## Overview

FCM is used for all push notifications. The client registers a device token on login; the server stores it per device per user. No push is sent when the recipient is already connected via WebSocket.

---

## Device Token Management

- Client calls `PUT /v1/users/device` after login and on app launch if the OS has rotated the token
- A user can have multiple tokens (multiple devices); all are notified unless the token is stale
- Stale token detection: FCM returns `UNREGISTERED` → server deletes that token

## Payload

Notification payloads carry enough data for the client to route directly to the match (e.g. `matchId`). The client opens the match screen on tap without requiring a full app reload.

---

## Tasks

`[ ]` not started · `[~]` in progress · `[x]` done

**Server**
- [ ] `PUT /v1/users/device` — register / refresh FCM token
- [ ] Stale token cleanup on FCM `UNREGISTERED` error

---

## Related

- Device token endpoint: [api-reference.md#users](../api-reference.md#users)
- Trigger details: [game-system.md#push-notifications](../game-system.md#push-notifications)
- DB: [database-schema.md#device_tokens](../database-schema.md#device_tokens)
