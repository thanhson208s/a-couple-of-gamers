# Offline Mode

**Requires reading:** [requirements.md#offline-mode](../requirements.md#offline-mode) | [hot-update.md#game-bundle-hot-update](../hot-update.md#game-bundle-hot-update) | [game-system.md#game-plugin-interface](../game-system.md#game-plugin-interface)

---

## Overview

Offline mode is the zero-network, zero-account experience. With no internet connectivity, the app runs fully locally — no Firebase login, no JWT, no server calls, no stored identity of any kind. Two game modes are available: **vs AI** and **Pass-n-Play** (two humans sharing one device). Everything else is gated behind a prompt asking the user to turn on their internet connection. Data produced offline stays on the device and is never synced, even after connectivity returns.

---

## First-launch Flow

The login screen is connectivity-aware.

```
App opens for the first time → login screen

If isOnline:
  → Show normal login UI (Google / Apple / Facebook).
  → No auto-login — user must tap a social button, or get prompted later on
    create/join (see "Going online" below).

If !isOnline:
  → Show offline prompt with two actions:
      1. "Turn on internet to log in"   → instructional only; re-checks reachability
      2. "Play offline"                 → enters offline home directly (no account,
                                          no username, nothing to enter)
```

---

## Connectivity Detection

- Client monitors OS-level reachability and maintains a single `isOnline` flag.
- `isOnline === false`: persistent offline banner shown in the app shell.
- Transition `online → offline` mid-session: the current screen stays usable only if it's an offline-capable screen (AI match, Pass-n-Play match); otherwise the offline prompt surfaces and the user returns to the offline home.
- Transition `offline → online`: banner hidden, gated surfaces re-enabled. **No auto-login.**

---

## No Identity While Offline

- `currentUser` in memory is `null`.
- No Firebase anonymous login, no JWT access/refresh tokens issued or stored.
- No username, no profile — nothing persisted that identifies the person.
- In-match labels come from the mode itself: vs AI uses generic "You" / "AI"; Pass-n-Play uses the colors each player picked before starting.

---

## Going Online — Login Triggers

Login is lazy. Even when `isOnline === true`, the app does **not** auto-login. Login runs only on explicit action:

| Trigger | Behavior |
|---------|----------|
| User taps Google / Apple / Facebook in Settings | Run the corresponding social-login flow in [account-management.md](account-management.md). |
| User taps Create room or Join room while logged out | Show a "sign in to continue" prompt offering anonymous login (recommended) or social login. On success, retry the create/join action. |
| Offline → online transition | Hide the offline banner and re-enable gated surfaces. No auto-login — user stays logged-out until they explicitly sign in or hit a trigger. |

Anonymous login via the create/join prompt is fully supported — it's the frictionless path for users who just want to play online without tying an identity to it.

---

## What Is Enabled Offline

- **vs AI** — any game whose bundle is cached locally **and** whose catalog entry has `aiAvailable === true`.
- **Pass-n-Play** — any game whose bundle is cached locally **and** whose catalog entry has `pnpAvailable === true`.

Per-game catalog flags drive both filters; see [games-management.md#mode-availability](games-management.md#mode-availability).

---

## What Is Gated Offline

Each of the following surfaces the "turn on internet connection" prompt when tapped:

| Surface | Reason |
|---------|--------|
| Google / Apple / Facebook sign-in | Requires Firebase + server login |
| Create room / Join room | Requires a server-created match |
| Game catalog refresh | Config + manifest fetches need network |
| Favorites sync | Server-backed |
| Profile edit / account deletion | Server mutations |
| Any screen that calls `/v1/*` | Server unreachable |

---

## Session Flow — vs AI Match

```
User opens AI match (bundle cached AND catalog.aiAvailable === true)
  → Client initialises local game state via plugin.initialState()
  → No WS connection, no server calls, no match id

User and AI take turns locally:
  → User submits move → plugin.applyAction() runs client-side
  → AI component reads View, computes Move, calls applyAction() again
  → Client renders updated state
  → Repeat until plugin.isGameOver() returns true

Match ends:
  → Result stored in local device storage only
  → No server call — AI matches never produce a server record
    (see api-reference.md#matches)
```

---

## Session Flow — Pass-n-Play Match

Two humans share one device, alternating physical access to the screen.

```
User opens PnP match (bundle cached AND catalog.pnpAvailable === true)
  → Color picker screen:
      Player 1 picks a color from the game's allowed palette
      Player 2 picks a different color from what remains
      (Palette defined by the plugin; exact schema TBD)
  → Client initialises local game state via plugin.initialState()
  → Slot→color mapping stored in the local match record; used for labels/UI only,
    never passed into plugin logic

Turns alternate on the same device:
  → Active player (by slot) submits move → plugin.applyAction() runs client-side
  → Client renders updated state; UI surfaces "<color>'s turn" prompt
  → Repeat until plugin.isGameOver() returns true

Match ends:
  → Result stored in local device storage only (winner recorded by slot + color)
  → No server call
```

Hidden-information games may need a hand-off / screen-hiding step between turns — per-game plugin concern, **TBD** and out of scope here.

---

## State Persistence (quit and resume)

Both AI and PnP match state live on the device. Specific storage layer (SQLite vs. file-based vs. key-value) is **TBD**. PnP records additionally store the slot→color mapping.

- Quits mid-match: current game state (and PnP color mapping) saved locally.
- Resumes: client loads state from local storage and continues locally.
- Restart: user can abandon and start a new match; previous state cleared.

---

## Tasks

`[ ]` not started · `[~]` in progress · `[x]` done

**Client**
- [ ] Connectivity watcher; `isOnline` flag; offline indicator banner
- [ ] Connectivity-aware login screen: offline prompt with "turn on internet" vs "play offline" actions
- [ ] Boot path: no auto-login (online OR offline); `currentUser` starts `null`
- [ ] Gate all online-only surfaces; show "turn on internet" prompt
- [ ] Lazy-login prompt on create/join match (anonymous or social)
- [ ] Per-game mode selection UI driven by catalog `aiAvailable` / `pnpAvailable`
- [ ] Offline vs AI match play loop (uses local game plugin)
- [ ] Offline Pass-n-Play match: color picker, slot→color mapping, turn prompts
- [ ] Local persistence of in-progress match state for both AI and PnP (storage layer TBD)
- [ ] Local-only result recording (no server call)
- [ ] online→offline transition: safe-fallback navigation
- [ ] offline→online transition: re-enable gated surfaces; no auto-login

**Shared**
- [ ] Extend client catalog schema with `aiAvailable` and `pnpAvailable` booleans per game

---

## Related

- Game plugin interface: [game-system.md#game-plugin-interface](../game-system.md#game-plugin-interface)
- Catalog schema (incl. `aiAvailable` / `pnpAvailable`): [games-management.md#mode-availability](games-management.md#mode-availability)
- Bundle download (required before play): [../hot-update.md#game-bundle-hot-update](../hot-update.md#game-bundle-hot-update)
- Login flow (for when user later goes online): [account-management.md](account-management.md)
- AI and PnP matches not recorded server-side: [api-reference.md#matches](../api-reference.md#matches), [database-schema.md](../database-schema.md)
