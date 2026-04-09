# Guest Auth & Account Upgrade

**Requires reading:** [requirements.md#guest-access](../requirements.md#guest-access) | [security.md#authentication](../security.md#authentication)

---

## Overview

Guests get a device-local UUID on first launch. The UUID is stored in device secure storage (iOS Keychain / Android Keystore). The client exchanges it for a guest JWT via `POST /v1/auth/guest` and uses that JWT for all pre-login requests. All guest activity (matches, history) is stored in Postgres under the guest user record. On social login, the guest record is upgraded in-place — no data is moved.

---

## Guest State Flow

```
First launch:
  Client generates UUID → stored in device keychain
  Client calls POST /v1/auth/guest { guestId: <uuid> }
  → Server finds or creates user record (provider:'guest', provider_id:<uuid>)
  → Server issues guest JWT (type:'guest') + refresh token
  → All subsequent requests use Authorization: Bearer <guest-jwt>

Guest plays match:
  Match state stored in Postgres (associated with guest user record by user.id)
  Local SQLite on device is a read cache for offline browsing only
```

---

## Guest → Account Upgrade

```
Guest taps "Sign in with Google/Apple/Facebook"
  → POST /v1/auth/social
      Authorization: Bearer <guest-jwt>   ← signals upgrade
      Body: { idToken: "<firebase-id-token>" }
  → Server verifies Firebase ID token → extracts (provider, uid, displayName)
  → Server checks: does a social account already exist for (provider, uid)?
      Yes → log in to existing account (guest JWT ignored)
      No  → UPDATE users SET provider=<provider>, provider_id=<uid>,
                              display_name=<displayName>
             WHERE id = <guest user id from JWT>
  → Server issues social JWT pair (type:'social')
  → Client discards guest JWT; stores new refresh token in device secure storage
```

After upgrade:
- The user's `id` (10-char) is unchanged — all existing matches continue to reference it
- All requests use the social `Authorization: Bearer <access-token>`
- Local SQLite cache can be cleared; full history is available from the server

---

## Tasks

`[ ]` not started · `[~]` in progress · `[x]` done

**Server**
- [x] `POST /v1/auth/guest` — issue guest JWT (`type:'guest'`) from body `{ guestId }`
- [ ] `POST /v1/auth/social` — detect guest JWT bearer and upgrade guest record (see [social-login.md](social-login.md))

**Client**
- [ ] Generate and store UUID in device secure storage (iOS Keychain / Android Keystore) on first launch
- [ ] Call `POST /v1/auth/guest` on first launch; store guest JWT as normal access token

---

## Related

- Auth endpoints: [api-reference.md#auth](../api-reference.md#auth)
- JWT lifecycle: [security.md#jwt-lifecycle](../security.md#jwt-lifecycle)
- DB: [database-schema.md#users](../database-schema.md#users)
