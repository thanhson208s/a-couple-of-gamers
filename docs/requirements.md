# Requirements

Feature index with one-line descriptions. Details live in each feature's implementation doc.

---

## Account Management
→ [features/account-management.md](features/account-management.md)

Firebase-backed login for anonymous and social users (Google/Apple/Facebook), anonymous→social account upgrade, and account deletion.

---

## Game Lobby
→ [features/game-lobby.md](features/game-lobby.md)

Browse the game catalog, manage favorites, and view active matches with turn status.

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

## Rival History
→ [features/rival-history.md](features/rival-history.md)

Per-opponent match stats (wins/losses/draws per game) for social users.

---

## Monetization
→ [features/monetization.md](features/monetization.md)

Banner and interstitial ads, remove-ads IAP, donations, and affiliate links.

---

## Hot Update
→ [features/hot-update.md](features/hot-update.md)

OTA app update via Cocos AssetsManager on launch, without an app store release.

---

## Mini Game Bundles
→ [features/game-bundles.md](features/game-bundles.md)

Per-game Asset Bundle download, version check on launch, and offline caching.

---

## Remote Config
→ [features/remote-config.md](features/remote-config.md)

Server-side config fetched on launch; controls game visibility via admin dashboard.

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
