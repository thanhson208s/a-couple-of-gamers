# Match Completion

**Requires reading:** [requirements.md#match-completion](../requirements.md#match-completion)

---

## Overview

Match completion works differently for vs Human and vs AI matches. For vs Human, the server detects game over and records the result. For vs AI, the client plays the full game offline and reports the result to the server on completion.

---

## vs Human Completion (Server-Driven)

1. Player submits move → server calls `applyMove` → calls `isGameOver`
2. If game is over: record `winner_id` (null for draw), transition match status to `completed`
3. Update `rival_stats` for both players if both are logged-in users (skipped for guests)
4. Return final player view with `matchStatus: 'completed'` to the submitting player; broadcast to both via WS if both connected

## vs AI Completion (Client-Driven)

1. Client plays the full game locally via the shared game plugin (`packages/game-logic/<slug>/`)
2. When `isGameOver()` returns true client-side, the match ends
3. Client calls `POST /v1/matches/:id/complete` with `{ winnerId }` — server trusts this result without re-validating moves
4. Server records outcome and transitions match status to `completed`
5. `rival_stats` are not updated for AI matches

## Client-Side Steps (both paths)

1. Client shows results screen (winner/draw/score)
2. Interstitial ad shown after results screen (unless `is_ad_free = true`)
3. Player can tap "Return to lobby" or "Rematch" (rematch creates a new match with same game + opponent)

---

## Tasks

`[ ]` not started · `[~]` in progress · `[x]` done

**Server**
- [ ] End-of-game detection on move accept; transition match to `completed`
- [ ] Upsert `rival_stats` for both players (logged-in users only)

**Client**
- [ ] Results screen (winner / draw)
- [ ] Rematch flow

---

## Related

- Game plugin: [game-system.md#game-plugin-interface](../game-system.md#game-plugin-interface)
- WS event on completion: [api-reference.md#websocket-events](../api-reference.md#websocket-events) (`match_over`)
- DB: [database-schema.md#matches](../database-schema.md#matches), [database-schema.md#rival_stats](../database-schema.md#rival_stats)
