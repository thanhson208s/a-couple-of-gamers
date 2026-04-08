# Security

Two-token JWT auth (access + refresh with rotation), one-time WS ticket pattern, per-endpoint rate limiting, input validation policy, security headers, and secrets management.

---

## Authentication

### Dev Mode (Local Only)

Dev mode provides a password-less login path and cheat endpoints for local development. It is controlled by two conditions — **both must be true** for dev endpoints to respond:

1. `CF_TEAM_DOMAIN` is **not** set (the Cloudflare Access env var; present on staging and production)
2. `DEV_MODE=true` is explicitly set in the environment

If either condition fails, all dev endpoints return `404 Not Found`. The 404 (not 403) ensures the endpoints do not reveal their existence on non-dev environments.

Dev endpoints are never rate-limited and bypass Firebase authentication. They must never appear in staging or production `.env` files.

---

### Social Login via Firebase

The client uses the Firebase SDK to run the OAuth flow with the chosen provider (Google/Apple/Facebook). Firebase issues a short-lived ID token to the client upon success. The client sends this ID token to `POST /v1/auth/social`. The server verifies it using the Firebase Admin SDK — no direct calls to provider APIs needed. Provider identity (`uid`, `email`, `displayName`) is extracted from the decoded token and used to find or create the user account.

---

### JWT Lifecycle

Two-token model: short-lived access token + long-lived refresh token.

| Token | Lifetime | Storage | Sent as |
|-------|----------|---------|---------|
| Access token | 15 minutes | Memory only (never persisted) | `Authorization: Bearer <token>` header |
| Refresh token | 30 days | Device secure storage (iOS Keychain / Android Keystore) | `POST /v1/auth/refresh` body |

Flow:
```
Login → server issues access token + refresh token
Access token expires → client silently calls POST /v1/auth/refresh
  → server validates refresh token, issues new access token (+ rotates refresh token)
Refresh token expires or is revoked → client must log in again
```

Refresh token rotation: each use issues a new refresh token and invalidates the old one. Detected reuse of an invalidated refresh token revokes the entire session.

### WebSocket Authentication

**Problem:** Passing a JWT as a query param (`?token=...`) causes the token to appear in server access logs and reverse proxy logs.

**Solution — short-lived WS ticket:**
```
1. Client calls POST /v1/auth/ws-ticket (with valid JWT in header)
2. Server generates a one-time random ticket, stores it in Redis with a 30s TTL
3. Server returns ticket to client
4. Client opens WS connection: wss://<host>/v1/ws?ticket=<ticket>
5. Server validates ticket on connect, immediately deletes it from Redis
6. JWT never appears in any log
```

The WS connection is **user-scoped and persistent** — opened once after login, used for all match events and lobby notifications. The ticket authenticates the user (not a specific match).

Tickets are single-use and expire in 30 seconds regardless of use.

---

## Rate Limiting

Applied at the API server level via `AppGuard` (extends `@nestjs/throttler`) with Redis storage.

| Endpoint / action | Limit | Window | Key |
|-------------------|-------|--------|-----|
| `POST /v1/auth/social` (login) | 10 requests | per minute | IP |
| `POST /v1/auth/guest` | 120 requests | per minute | IP |
| `POST /v1/auth/refresh` | 20 requests | per minute | IP (unauthenticated) |
| WS event | 30 events | per minute | userId |
| All other endpoints | 120 requests | per minute | userId (IP fallback) |
| `GET /dev`, `/v1/dev/cheat/*` | exempt | — | — |

**Implementation:**
- Throttler `app-throttle` (120 req/user/min) is the global default for all HTTP endpoints; specific endpoints override via `@Throttle({ 'app-throttle': { ttl, limit } })`.
- `AppGuard` tracks by `userId` for authenticated requests, falls back to IP for unauthenticated endpoints.
- WS events are rate-limited by `WsInterceptor` (Redis INCR pattern) using the `ws-throttle` config (30 events/user/min by default); individual handlers can override via `@WsThrottle({ limit, ttl })`.
- Dev endpoints are exempt via `@SkipThrottle()`.

Rate limit state stored in Redis. Limits are conservative starting points — adjust based on observed usage.

---

## Input Validation

- All request bodies validated at the API boundary using NestJS `ValidationPipe` with `class-validator`
- Unknown properties stripped (`whitelist: true`, `forbidNonWhitelisted: true`)
- Game-specific move payloads validated inside `applyMove` — the game plugin throws on invalid input; the server catches and returns a 400
- No raw SQL; all DB access through TypeORM (parameterized queries by default)

---

## Security Headers

Configured at the reverse proxy level (not in NestJS):

| Header | Value |
|--------|-------|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `no-referrer` |

---

## Secrets Management

- All secrets (DB password, Redis password, JWT signing key, FCM service account, Sentry DSN, social auth credentials) stored as environment variables
- Never committed to the repository
- In production: managed via GitHub Actions secrets (CI/CD) and `.env` files on VPS (not committed)
- JWT signing key: minimum 256-bit random secret; separate keys for access and refresh tokens
