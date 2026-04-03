# Match Completion

**Requires reading:** [requirements.md#match-completion](../requirements.md#match-completion)

---

## Overview

Match completion is triggered when the game plugin signals the game is over (`isGameOver` returns true after a move). The server records the outcome, updates rival stats, and the client shows results. This flow is identical for vs AI and vs Human matches.

---

## Server-Side Steps

1. `applyMove` is called → after writing state, server calls `isGameOver`
2. If game is over: record `winner_id` (null for draw), transition match status to `completed`
3. Update `rival_stats` for both players if both are logged-in users (skipped for guests and AI matches)
4. Return final player view with `matchStatus: 'completed'` to the submitting player; broadcast to both via WS if both connected

## Client-Side Steps

1. Client receives completed state → shows results screen (winner/draw/score)
2. Interstitial ad shown after results screen (unless `is_ad_free = true`)
3. Player can tap "Return to lobby" or "Rematch" (rematch creates a new match with same game + opponent)

---

## Related

- Game plugin: [game-system.md#game-plugin-interface](../game-system.md#game-plugin-interface)
- WS event on completion: [api-reference.md#websocket-events](../api-reference.md#websocket-events) (`match_over`)
- DB: [database-schema.md#matches](../database-schema.md#matches), [database-schema.md#rival_stats](../database-schema.md#rival_stats)
