# Requirements

All 12 functional features and non-functional requirements. Each feature section links to its implementation doc in [features/](features/).

---

## Guest Access
→ Implementation: [features/guest-auth.md](features/guest-auth.md)

- Auto-assigned a device-local UUID on first launch; no sign-up required
- Game history and stats stored locally on device (SQLite)
- Can play vs AI and vs Human matches
- Concurrent human matches capped at a configurable limit (value TBD)

---

## Social Login
→ Implementation: [features/social-login.md](features/social-login.md)

- Providers: Google, Apple, Facebook
- Required for: rival history, synced favorites, extended concurrent match limit
- Account identified by provider + provider_id; display name pulled from provider
- On first login: guest data merged into the new account (in-progress matches up to guest limit)

---

## Account Deletion
→ Implementation: [features/account-deletion.md](features/account-deletion.md)

- Logged-in users may delete their account at any time
- On deletion:
  - Active and pending matches abandoned (no stats impact)
  - All user data hard-deleted: account, device tokens, favorites, rival stats (as both owner and opponent)
  - Match history records deleted
  - Opponents' rival stats referencing the deleted user also deleted
- Guest accounts have no server-side record; they expire naturally via inactive match cleanup

---

## Game Lobby
→ Implementation: [features/game-lobby.md](features/game-lobby.md)

- Browse the full game catalog (name, cover image, player count, brief description)
- Mark games as favorites; synced to server for logged-in users, local-only for guests; favorites shown at top of list
- Active matches list with "your turn" / "waiting for opponent" status per match; tapping opens that match directly
- "Your turn" count shown as a persistent badge accessible from anywhere in the app
- Match list refreshed automatically when online; re-fetched on app foreground resume

---

## Match Lifecycle
→ Implementation: [features/match-lifecycle.md](features/match-lifecycle.md)

- Select a game and opponent type (vs AI or vs Human) to create a match
- For vs Human: invite a specific opponent via:
  - **Invite code** — short alphanumeric code; anyone with the code can join; single-use (deleted once an opponent joins)
  - **Deep link** — shareable URL wrapping the invite code; opens the app directly to the join screen
- Match stays in `pending` state until an opponent joins or the inactive match cleanup deletes it
- Either player can abandon a match at any time (no stats impact)
- A player can have multiple concurrent human matches (limit TBD for guests; higher limit for logged-in users)

---

## vs AI Match
→ Implementation: [features/vs-ai.md](features/vs-ai.md)

- AI is a local Godot node; always real-time (AI requires a running client)
- AI generates moves client-side and submits via the normal move API; server validates identically to human moves
- Player can have at most 1 concurrent AI match per game on a device
- Player can quit and resume an AI match at any time
- Unfinished AI matches are not recorded in history; only completed matches count

---

## vs Human Match
→ Implementation: [features/match-session.md](features/match-session.md)

- All human matches are async by default — neither player needs to be online simultaneously
- Move submission via REST; server sends FCM push to opponent after each move (see [Push Notifications](#push-notifications))
- **Auto-upgrade to real-time:** when both players have active WebSocket connections, the server detects presence and broadcasts moves instantly via WS — no explicit mode switch
- When either player disconnects, match silently falls back to async (REST + FCM)
- A player can have multiple concurrent human matches against different or the same opponent in different games
- No time limit per turn (optional timer may be added later — see [Future / Planned](#future--planned))
- **Turn reminder:** if a player has not moved after a TBD interval, server sends one FCM follow-up; not repeated until the turn changes again (see [Background Workers](#background-workers))

---

## Match Completion
→ Implementation: [features/match-completion.md](features/match-completion.md)

When the last valid move is accepted by the server:
- Match status transitions to `completed`; `winner_id` recorded (null for draw)
- Rival stats updated for both players (logged-in users only)
- Client shows results screen (winner/draw, score summary)
- Interstitial ad shown after results screen (unless player is ad-free)
- Player can return to lobby or start a rematch

---

## Push Notifications
→ Implementation: [features/push-notifications.md](features/push-notifications.md)

- Players register an FCM device token on login; token updated on app launch if rotated by the OS
- Server dispatches push notifications to the opponent's device on:
  - Opponent's turn (after a move is submitted in async mode)
  - Turn reminder (after inactivity — see [Background Workers](#background-workers))
- Push is not sent when the opponent is already connected via WebSocket (real-time path)
- Covers iOS (via APNs bridge) and Android

---

## Rival History
→ Implementation: [features/rival-history.md](features/rival-history.md)

- Requires login
- Rivals list shows all opponents with at least one completed match
- Per-rival detail: matches played, wins, losses, draws — broken down per game
- Stats updated at match completion

---

## Monetization
→ Implementation: [features/monetization.md](features/monetization.md)

- **Banner ads** — displayed during active gameplay (bottom of screen)
- **Interstitial ads** — shown after match completion (before results screen); skipped if player is ad-free
- **Remove ads IAP** — one-time purchase; sets `is_ad_free = true` on account; persists across devices for logged-in users
- **Donations** — voluntary tip/donation flow (implementation TBD)
- **Affiliate links** — links to physical product pages for featured games; shown in game detail screen

---

## Background Workers
→ Implementation: [features/background-workers.md](features/background-workers.md)

### Inactive Match Cleanup
- Matches with no move activity for a TBD period are hard-deleted from the database
- Applies to both `pending` and `active` (stalled) matches
- Runs on a background schedule; no stats impact — not a forfeit
- Players see the match disappear from their active list on next refresh

### Turn Reminder
- After a TBD inactivity period, server sends one FCM reminder to the player whose turn it is
- Not repeated until the turn changes (opponent moves)
- Cancelled if the player moves before the reminder fires

---

## Non-Functional Requirements

- **Availability** — staging environment validates all changes before production; see [infrastructure.md#deployment-topology](infrastructure.md#deployment-topology)
- **Backup** — daily automated Postgres dump to Cloudflare R2; see [infrastructure.md#backup](infrastructure.md#backup)
- **Error monitoring** — Sentry captures server exceptions and Godot client crashes
- **Analytics** — Firebase Analytics tracks key client events (match started, game completed, IAP, etc.)
- **API versioning** — all routes prefixed `/v1/`; old mobile clients supported until an explicit sunset; see [api-reference.md#versioning](api-reference.md#versioning)
- **Health check** — `GET /health` endpoint returns service status for uptime monitoring
- **Security** — JWT auth, rate limiting, input validation; see [security.md](security.md)

---

## Future / Planned

_Placeholder — items not scoped yet. Add detail here when prioritized._

- Random matchmaking queue (match with strangers)
- Spectator mode
- Optional per-turn time limit for async matches
- More games (post-launch additions)
- Game tutorials, in-game hints and rules
