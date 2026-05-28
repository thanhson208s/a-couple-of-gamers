# Security Boundaries

This document describes security behavior enforced by the current application.
Identity and social-state lifecycle is documented separately in
[Identity and Social State](systems/identity-social.md).

## Authentication

### User JWT and Refresh Tokens

Firebase login verifies the Firebase ID token with revocation checking before
issuing application credentials.

| Credential | Lifetime / Storage Behavior | Use |
|---|---|---|
| Access token | JWT signed by the server with a 15-minute expiry | `Authorization: Bearer <token>` for protected HTTP endpoints |
| Refresh token | Opaque random token stored server-side as a SHA-256 hash; expires after 30 days | Exchanged in `POST /v1/auth/refresh` |

Refresh use revokes the submitted token and returns a replacement token. Reuse
of an already revoked token revokes all active refresh tokens for that user.
Logout revokes the supplied active refresh token if it exists.

### WebSocket Authentication

WebSocket connections use a short-lived one-time ticket so an access JWT is not
placed in the WebSocket URL:

1. An authenticated user requests `POST /v1/ws/ticket`.
2. The server stores a random ticket mapped to the user in Redis for 60 seconds.
3. The client connects to `/v1/ws?ticket=<ticket>`.
4. The server consumes the ticket on successful authentication.

Missing, unknown, reused, or expired tickets cause the socket to close with
code `4401`. A socket is associated with one user ID and replaces the
gateway's target for future sends to that user.

### Admin Authentication

Administrative endpoints use one of two modes:

| Configuration | Enforcement |
|---|---|
| Both `CF_TEAM_DOMAIN` and `CF_ACCESS_AUD` are set | Validate `CF-Access-JWT-Assertion` with Cloudflare Access JWKS and configured audience. JWKS are cached for one hour. |
| Either value is absent | Compare `X-Admin-Token` with `ADMIN_TOKEN`. |

### Development-Only Endpoints

Development endpoints return `404` unless both conditions hold:

- `NODE_ENV` is `development`;
- `CF_TEAM_DOMAIN` is unset.

They bypass normal authentication and HTTP throttling.
Using `404` instead of `403` prevents an unavailable development interface
from being disclosed by an authorization response.

## Authorization Rules

- User, match, configuration, and WebSocket-ticket operations require an
  authenticated application user.
- Administrative configuration and catalog mutation require administrative
  authentication.

## Rate Limiting

HTTP throttling uses Redis-backed Nest throttling with a global default of 120
requests per 60 seconds.

| Interface | Configured Limit |
|---|---|
| `POST /v1/auth/login` | 20 per 60 seconds |
| `POST /v1/auth/refresh` | 20 per 60 seconds |
| `POST /v1/matches` | 20 per hour |
| Other HTTP endpoints unless exempted | 120 per 60 seconds |
| Development endpoints | Exempt |
| WebSocket registered messages, default | 30 per 60 seconds per event/user |
| WebSocket `match:action` | 10 per 60 seconds per user |
| WebSocket `ping` | Exempt |

HTTP authentication currently executes after global HTTP throttling, so
protected HTTP requests are rate-tracked by request IP rather than
authenticated user ID. WebSocket throttling is keyed by authenticated user ID
and event name.

## Input Validation

Active HTTP body payloads and registered WebSocket message payloads use runtime
validation schemas. Unknown properties are rejected at the transport boundary.

The active interfaces are cataloged in [API Reference](api-reference.md).

## Secrets

Application secrets are read from environment configuration. These include
database/Redis credentials, JWT signing material, Firebase Admin credentials,
admin authentication values, and cache-purge credentials. Secrets must not be
committed to the repository. Production access-token signing material should
be generated with at least 256 bits of entropy.
