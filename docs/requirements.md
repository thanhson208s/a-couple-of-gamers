# Requirements

Functional and non-functional requirements. Functional requirements cover user- and admin-facing capabilities — details live in each feature's implementation doc. Non-functional requirements cover cross-cutting system qualities, each linked to its supporting doc.

---

## Functional Requirements

### Account Management
→ [features/account-management.md](features/account-management.md)

Firebase-backed login for anonymous and social users (Google/Apple/Facebook), anonymous→social account upgrade, and account deletion.

---

### Match Management
→ [features/match-management.md](features/match-management.md)

Create and join human matches via invite code or deep link; abandon or complete matches; update rival stats on completion.

---

### Offline Mode
→ [features/offline-mode.md](features/offline-mode.md)

No-account, no-network experience: connectivity-aware login screen, offline indicator, gated online surfaces, offline vs AI and Pass-n-Play modes on cached bundles (per-game availability via client catalog), local-only data.

---

### Notifications
→ [features/notifications.md](features/notifications.md)

FCM push to opponent on their turn (async mode) and turn reminder after inactivity.

---

### Users Management
→ [features/users-management.md](features/users-management.md)

User profile, server-synced favorites, and per-opponent match stats (wins/losses/draws per game).

---

### Monetization
→ [features/monetization.md](features/monetization.md)

Banner and interstitial ads, remove-ads IAP, donations, and affiliate links.

---

### Games Management
→ [features/games-management.md](features/games-management.md)

Two-gate game visibility: client catalog (hot-updated list + metadata) plus server-side per-game `status` (int enum: 0=under_maintenance, 1=coming_soon, 2=enabled, 3=disabled).

---

### Config Management
→ [features/config-management.md](features/config-management.md)

Server-side config fetched on launch; admin dashboard for game visibility and version thresholds.

---

## Non-Functional Requirements

- **Availability** — staging validates all changes before production; see [infrastructure.md](infrastructure.md)
- **Backup** — daily automated Postgres dump to Cloudflare R2; see [infrastructure.md#backup](infrastructure.md#backup)
- **Hot update** — OTA delivery of the main-app bundle via Cocos AssetsManager, without an app store release. Per-platform / per-minor-version tracks keep old native builds on compatible bundles; server-side `minSupportedVersion` and `latestVersion` thresholds drive a hard-block update screen and a soft "update available" banner. See [hot-update.md](hot-update.md)
- **Bundle delivery & offline caching** — per-game bundles fetched on demand from R2 (direct CDN, no server proxy), version-checked against the R2 manifest on each launch, and cached locally so previously installed games remain playable offline. See [hot-update.md#game-bundle-hot-update](hot-update.md#game-bundle-hot-update)
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
