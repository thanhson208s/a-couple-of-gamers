# Social Login

**Requires reading:** [requirements.md#social-login](../requirements.md#social-login) | [security.md#authentication](../security.md#authentication)

---

## Overview

Social login exchanges a provider-issued token (Google/Apple/Facebook) for a server-issued JWT pair (access + refresh token). If a guest UUID is present on the request, the server merges in-progress guest data before returning the JWT. See [guest-auth.md](guest-auth.md) for the merge flow.

---

## Key Points

- Provider token validated server-side against the provider's token introspection endpoint
- Account identified by `provider` + `provider_id`; display name synced from provider at login
- If the provider identity matches an existing account: log in to that account (no duplicate created)
- Refresh token rotation on every use; detected reuse revokes the entire session
- Access token: 15 min lifetime, held in memory only; refresh token: 30 days, stored in device secure storage

---

## Related

- Auth endpoints: [api-reference.md#auth](../api-reference.md#auth)
- JWT lifecycle detail: [security.md#jwt-lifecycle](../security.md#jwt-lifecycle)
- DB: [database-schema.md#users](../database-schema.md#users)
