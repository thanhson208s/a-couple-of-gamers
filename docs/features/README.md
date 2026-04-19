# Feature Design Documents

**What's here:** Implementation-level design for each of the 12 features — data flows, step-by-step sequences, and design decisions not captured in requirements.

---

## Purpose

Each file covers the implementation design of one feature. Requirements define WHAT; these docs define HOW.

## Structure of Each File

```
# Feature Name

**Requires reading:** links to requirements.md and related docs

## Overview
Core approach / key decision

## [Sections]
Flows, sequences, edge cases, design notes

## Tasks

`[ ]` not started · `[~]` in progress · `[x]` done

**Server**
- [ ] endpoint or job description

**Client**
- [ ] screen or behaviour description

**Shared** _(omit if not applicable)_
- [ ] shared package task

**CI** _(omit if not applicable)_
- [ ] pipeline task

## Related
Links to api-reference.md and database-schema.md sections
```

## Index

| File | Covers |
|------|--------|
| [account-management.md](account-management.md) | Firebase login (anonymous + social), account upgrade, account deletion |
| [game-lobby.md](game-lobby.md) | Catalog caching, favorites sync, active match list, "your turn" badge |
| [match-lifecycle.md](match-lifecycle.md) | Match state machine, invite flow, abandonment |
| [vs-ai.md](vs-ai.md) | AI session flow, state persistence, quit/resume |
| [match-session.md](match-session.md) | Human match async path, real-time auto-upgrade, reconnection, presence |
| [match-completion.md](match-completion.md) | End-of-game detection, rival stats update, results screen, rematch |
| [push-notifications.md](push-notifications.md) | Device token management, FCM dispatch, stale token cleanup |
| [rival-history.md](rival-history.md) | Denormalized stats counters, update on completion |
| [monetization.md](monetization.md) | Ads, IAP (remove ads), donations, affiliate links |
| [background-workers.md](background-workers.md) | Inactive match cleanup (repeatable job), turn reminder (delayed job) |
| [hot-update.md](hot-update.md) | Main app update via Cocos AssetsManager; manifest diff upload in CI |
| [mini-game-bundles.md](mini-game-bundles.md) | Per-game Asset Bundle download, version check on launch, offline caching |
| [remote-config.md](remote-config.md) | Admin dashboard, config fetch on launch, game enable/disable |
