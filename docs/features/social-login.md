# Social Login

**Requires reading:** [requirements.md#social-login](../requirements.md#social-login) | [security.md#authentication](../security.md#authentication)

---

## Overview

The client uses the Firebase SDK to run the OAuth flow for the chosen provider (Google/Apple/Facebook). Firebase issues a Firebase ID token to the client. The client sends that ID token to `POST /v1/auth/social`; the server verifies it with the Firebase Admin SDK, extracts the user identity, then issues its own JWT pair (access + refresh). If the caller holds a guest JWT (`type:'guest'`) and no social account exists yet for that provider identity, the guest user record is upgraded in-place. See [guest-auth.md](guest-auth.md) for the upgrade flow.

---

## Flow

```
Godot client
  → Firebase SDK: signInWithProvider(google|apple|facebook)
  → Firebase issues ID token to client

Client → POST /v1/auth/social
    Authorization: Bearer <guest-jwt>   ← optional; present only when upgrading from guest
    Body: { idToken: "<firebase-id-token>" }
  → Server: admin.auth().verifyIdToken(idToken)
  → Decoded token contains: uid, email, displayName, provider
  → Check if social account exists for (provider, uid)
      Exists     → log in; guest JWT ignored
      Not exists → if guest JWT present: UPDATE guest user record (provider, provider_id, display_name)
                   otherwise: INSERT new user
  → Issue social access token + refresh token (type:'social')
  ← Return JWT pair to client
```

---

## Key Points

- Server never calls Google/Apple/Facebook APIs directly — Firebase Admin SDK handles all provider token verification
- Account identified by Firebase `uid` (globally unique per provider per Firebase project)
- Display name synced from Firebase token at login
- If the Firebase identity matches an existing account: log in, no duplicate created
- Refresh token rotation on every use; detected reuse revokes the entire session
- Access token: 15 min lifetime, held in memory only; refresh token: 30 days, stored in device secure storage

---

## Tasks

`[ ]` not started · `[~]` in progress · `[x]` done

**Server**
- [ ] `POST /v1/auth/social` — verify Firebase ID token, upsert user, issue JWT
- [x] `POST /v1/auth/refresh` — refresh token rotation (opaque token, SHA-256 hash stored in `refresh_tokens`; reuse detection wipes session)
- [ ] Guest upgrade: detect `type:'guest'` bearer, UPDATE guest user record in-place (see [guest-auth.md](guest-auth.md))

**Client**
- [ ] Google / Apple / Facebook OAuth flow via Firebase SDK
- [ ] Store refresh token in device secure storage; hold access token in memory

---

## Related

- Auth endpoints: [api-reference.md#auth](../api-reference.md#auth)
- JWT lifecycle detail: [security.md#jwt-lifecycle](../security.md#jwt-lifecycle)
- DB: [database-schema.md#users](../database-schema.md#users)
