# Feature Design Documents

**What's here:** Implementation-level design for each of the user-facing features — data flows, step-by-step sequences, and design decisions not captured in requirements.

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
| [match-management.md](match-management.md) | Match state machine, invite flow, abandonment, completion, rival stats |
| [offline-mode.md](offline-mode.md) | Offline shell: no-login state, connectivity indicator, gated online surfaces, vs AI + Pass-n-Play session flows, local state persistence |
| [notifications.md](notifications.md) | Device token management, FCM dispatch, stale token cleanup |
| [users-management.md](users-management.md) | User profile, favorites sync, rival stats |
| [monetization.md](monetization.md) | Ads, IAP (remove ads), donations, affiliate links |
| [games-management.md](games-management.md) | Two-gate visibility: client catalog (slugs + metadata) + server-side per-game `status` |
| [config-management.md](config-management.md) | Config fetch on launch, game tile states, admin dashboard |
