# Guest Auth & Account Upgrade

**Requires reading:** [requirements.md#guest-access](../requirements.md#guest-access) | [security.md#authentication](../security.md#authentication)

---

## Overview

Guests get a device-local UUID on first launch. The UUID is stored in device secure storage (iOS Keychain / Android Keystore) and sent as `X-Guest-Id` header on all requests before login. On first social login, in-progress guest data is merged into the new account and the guest identifier is retired.

---

## Guest State Flow

```
First launch:
  Godot generates UUID → stored in device keychain
  All requests sent with header: X-Guest-Id: <uuid>

Guest plays match:
  Match state stored in server Postgres (associated with guest UUID)
  Local SQLite on device caches match list and history for offline browsing
```

---

## Guest → Account Upgrade

```
Guest taps "Sign in with Google/Apple/Facebook"
  → POST /v1/auth/social  (with X-Guest-Id header still present)
  → Server creates user account from provider identity
  → Server merges: in-progress async matches up to guest limit transferred to new account
  → Server issues JWT (access token + refresh token)
  → Client stores refresh token in device secure storage; holds access token in memory
  → Client clears local SQLite cache; history now fetched from server
```

After login:
- All requests use `Authorization: Bearer <access-token>` instead of `X-Guest-Id`
- Guest UUID is no longer sent; any remaining guest state on the server is orphaned and will be cleaned up by the inactive match worker

---

## Tasks

`[ ]` not started · `[~]` in progress · `[x]` done

**Server**
- [ ] `POST /v1/auth/guest` — issue guest JWT from `X-Guest-Id` header

**Client**
- [ ] Generate and store UUID in device secure storage (iOS Keychain / Android Keystore) on first launch
- [ ] Send `X-Guest-Id` header on all pre-login requests

---

## Related

- Auth endpoints: [api-reference.md#auth](../api-reference.md#auth)
- JWT lifecycle: [security.md#jwt-lifecycle](../security.md#jwt-lifecycle)
- DB: [database-schema.md#users](../database-schema.md#users)
