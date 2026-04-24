# Account Management

**Requires reading:** [requirements.md#account-management](../requirements.md#account-management) | [security.md#authentication](../security.md#authentication)

---

## Overview

Covers the full user identity lifecycle: login (anonymous and social), account upgrade, and account deletion.

All users authenticate through a single `POST /v1/auth/login` endpoint backed by Firebase. Anonymous users (`signInAnonymously()`) and social users (Google/Apple/Facebook) are the same entity class — same DB table, same JWT structure — differentiated only by the `type` claim for feature gating. Account deletion is a single atomic operation that hard-deletes all user-owned data.

---

## Login Flow

```
Client → Firebase SDK: signInAnonymously()  OR  signInWithProvider(google|apple|facebook)
→ Firebase issues ID token

Client → POST /v1/auth/login { idToken }
→ Server: admin.auth().verifyIdToken(idToken)
→ Decoded token: { uid, firebase.sign_in_provider, name/displayName }
→ UsersService.findOrUpsertByFirebaseUid(uid, provider, displayName)
    - Found: update provider + displayName if changed
    - Not found: INSERT new user
→ Issue JWT pair (type: 'anonymous' | 'social')
← Return { accessToken, refreshToken }
```

---

## Account Upgrade (anonymous → social)

Firebase handles the identity merge client-side. Because the Firebase UID is preserved through account linking, a plain re-login on the server completes the upgrade — no separate endpoint or bearer token needed.

```
Client: Firebase SDK link anonymous account → social provider
→ Firebase issues new ID token (same uid, sign_in_provider now 'google.com' etc.)

Client → POST /v1/auth/login { idToken }
→ Server verifies token: same uid as existing anonymous user
→ findOrUpsertByFirebaseUid updates provider + displayName in-place
→ Issues JWT with type:'social'
← Client discards old access token; stores new refresh token
```

After upgrade the user's `id` (10-char) is unchanged — all existing matches continue to reference it.

---

## JWT `type` Claim

| `type` | Firebase `sign_in_provider` | Meaning |
|--------|----------------------------|---------|
| `'anonymous'` | `anonymous` | Guest-tier user; feature limits apply |
| `'social'` | `google.com`, `apple.com`, `facebook.com` | Fully linked social account |
| `'dev'` | — | Dev-only; never on staging/prod |

Derived from the Firebase `sign_in_provider` claim inside `AuthService.tokenType()`. Also re-derived when `POST /v1/auth/refresh` re-issues an access token (reads current `provider` from DB).

---

## Account Deletion

Account deletion is a single atomic operation: abandon all active matches, then hard-delete all user-owned data in cascade order, including data owned by other users that references the deleted account (rival stats).

### Deletion Order

1. Abandon all `pending` and `active` matches (status → `abandoned`; no rival stats recorded)
2. Delete rival stats rows where `user_id = deleted` OR `opponent_id = deleted` (both directions)
3. Delete match history, favorites, device tokens
4. Delete the user record

All steps run in a single DB transaction. If any step fails, the entire deletion is rolled back.

---

## Tasks

`[ ]` not started · `[~]` in progress · `[x]` done

**Server**
- [x] `POST /v1/auth/login` — verify Firebase ID token, upsert user, issue JWT pair
- [x] `UsersService.findOrUpsertByFirebaseUid` — find by `provider_id` (UID); update `provider` + `display_name` if changed; create if not found
- [x] `DELETE /v1/users/profile` — cascade delete user data in transaction order

**Client**
- [ ] Anonymous sign-in via Firebase SDK (`signInAnonymously()`) on first launch; send ID token to `POST /v1/auth/login`
- [ ] Google / Apple / Facebook OAuth flow via Firebase SDK; send ID token to `POST /v1/auth/login`
- [ ] Anonymous → social account linking flow (Firebase SDK `linkWithPopup` / `linkWithCredential`); re-login after link
- [ ] Store refresh token in device secure storage; hold access token in memory
- [ ] Account deletion UI — confirm dialog + call `DELETE /v1/users/profile`

---

## Related

- Auth endpoints: [api-reference.md#auth](../api-reference.md#auth)
- Deletion endpoint: `DELETE /v1/users/profile` → [api-reference.md#users](../api-reference.md#users)
- JWT lifecycle: [security.md#jwt-lifecycle](../security.md#jwt-lifecycle)
- DB tables affected by deletion: `users`, `matches`, `rival_stats`, `user_favorites`, `device_tokens` → [database-schema.md](../database-schema.md)
