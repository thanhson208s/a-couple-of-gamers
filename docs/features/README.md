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

## Related
Links to api-reference.md and database-schema.md sections
```

## Index

| File | Covers |
|------|--------|
| [guest-auth.md](guest-auth.md) | Guest UUID, device storage, server state, guest→account merge |
| [social-login.md](social-login.md) | OAuth provider token exchange, JWT issuance, refresh token rotation |
| [account-deletion.md](account-deletion.md) | Cascade delete order, transaction safety |
| [game-lobby.md](game-lobby.md) | Catalog caching, favorites sync, active match list, "your turn" badge |
| [match-lifecycle.md](match-lifecycle.md) | Match state machine, invite flow, abandonment |
| [vs-ai.md](vs-ai.md) | AI session flow, state persistence, quit/resume |
| [match-session.md](match-session.md) | Human match async path, real-time auto-upgrade, reconnection, presence |
| [match-completion.md](match-completion.md) | End-of-game detection, rival stats update, results screen, rematch |
| [push-notifications.md](push-notifications.md) | Device token management, FCM dispatch, stale token cleanup |
| [rival-history.md](rival-history.md) | Denormalized stats counters, update on completion |
| [monetization.md](monetization.md) | Ads, IAP (remove ads), donations, affiliate links |
| [background-workers.md](background-workers.md) | Inactive match cleanup (repeatable job), turn reminder (delayed job) |
