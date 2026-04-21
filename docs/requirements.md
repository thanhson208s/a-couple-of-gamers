# Requirements

Feature index with one-line descriptions. Details live in each feature's implementation doc.

---

## Account Management
→ [features/account-management.md](features/account-management.md)

Firebase-backed login for anonymous and social users (Google/Apple/Facebook), anonymous→social account upgrade, and account deletion.

---

## Match Management
→ [features/match-management.md](features/match-management.md)

Create and join human matches via invite code or deep link; abandon or complete matches; update rival stats on completion.

---

## vs AI Match
→ [features/vs-ai.md](features/vs-ai.md)

Offline AI match using a local Cocos component; result reported to server on completion.

---

## Push Notifications
→ [features/push-notifications.md](features/push-notifications.md)

FCM push to opponent on their turn (async mode) and turn reminder after inactivity.

---

## Users Management
→ [features/users-management.md](features/users-management.md)

User profile, server-synced favorites, and per-opponent match stats (wins/losses/draws per game).

---

## Monetization
→ [features/monetization.md](features/monetization.md)

Banner and interstitial ads, remove-ads IAP, donations, and affiliate links.

---

## Hot Update
→ [features/hot-update.md](features/hot-update.md)

OTA app update via Cocos AssetsManager on launch, without an app store release.

---

## Games Management
→ [features/games-management.md](features/games-management.md)

Two-gate game visibility: client catalog (hot-updated list + metadata) plus server-side per-game `status` (int enum: 0=under_maintenance, 1=coming_soon, 2=enabled, 3=disabled). Bundle download, version check on launch, and offline caching.

---

## Config Management
→ [features/config-management.md](features/config-management.md)

Server-side config fetched on launch; game tile download states; admin dashboard for game visibility.

---

## Non-Functional Requirements

- **Availability** — staging validates all changes before production; see [infrastructure.md](infrastructure.md)
- **Backup** — daily automated Postgres dump to Cloudflare R2; see [infrastructure.md#backup](infrastructure.md#backup)
- **Error monitoring** — Sentry for server exceptions and client crashes
- **Analytics** — Firebase Analytics for key client events
- **API versioning** — all routes prefixed `/v1/`; see [api-reference.md#versioning](api-reference.md#versioning)
- **Health check** — `GET /health` returns service status
- **Security** — JWT auth, rate limiting, input validation; see [security.md](security.md)

---

## Future / Planned

- Random matchmaking queue
- Spectator mode
- Optional per-turn time limit
- More games (post-launch)
- In-game tutorials and hints
