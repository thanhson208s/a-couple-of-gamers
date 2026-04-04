# vs AI Session

**Requires reading:** [requirements.md#vs-ai-match](../requirements.md#vs-ai-match) | [game-system.md#ai-integration](../game-system.md#ai-integration)

---

## Overview

AI matches run fully offline — no server connection is needed during play. The entire game (move validation, state transitions, win detection) runs client-side using the shared TypeScript game plugin from `packages/game-logic/<slug>/`. The server is only contacted at match completion to record the result.

---

## Session Flow

```
Human opens AI match (game bundle must be downloaded or preinstalled)
  → Client initialises local game state via plugin.initialState()
  → No WS connection, no server calls

Human and AI take turns locally:
  → Human submits move → plugin.applyMove() runs client-side
  → AI component reads PlayerView, computes Move, calls applyMove() again
  → Client renders updated state
  → Repeat until plugin.isGameOver() returns true

Match ends:
  → Client calls POST /v1/matches/:id/complete  { winnerId }
  → Server records result, updates match status to completed
  → Server does not re-validate moves
```

---

## State Persistence (quit and resume)

AI match state is stored on the device, not on the server during play.

- **Human quits mid-match:** current game state saved to device storage
- **Human resumes:** client loads state from device storage and continues locally
- **Unfinished matches:** not reported to server; only completed matches are recorded in history
- **Restart:** human can abandon and start a new AI match; previous state cleared from device

---

## Related

- Game plugin interface: [game-system.md#game-plugin-interface](../game-system.md#game-plugin-interface)
- AI completion endpoint: [api-reference.md#matches-ai-completion](../api-reference.md#matches-ai-completion)
- Bundle download (required before play): [mini-game-bundles.md](mini-game-bundles.md)
- DB: [database-schema.md#match_players](../database-schema.md#match_players) (`is_ai` flag for the AI seat)
