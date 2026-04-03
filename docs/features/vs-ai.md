# vs AI Session

**Requires reading:** [requirements.md#vs-ai-match](../requirements.md#vs-ai-match) | [game-system.md#ai-integration](../game-system.md#ai-integration)

---

## Overview

AI logic runs entirely in the Godot client (a per-game AI node). The AI submits moves through the same API as human players; the server validates AI moves identically to human moves. Because the AI requires a running client, AI matches are always real-time — there is no async variant.

---

## Session Flow

```
Human player opens AI match → connects WS
Server creates Redis room for the match

Human and AI take turns:
  → Both submit moves via WS
  → Server validates via game plugin (same path as human moves)
  → Writes updated state to Postgres
  → Broadcasts updated player view to the human client

On match end: server records result, updates match status to completed
```

The AI node reads the current player view from the broadcast, computes its move locally, and submits it — no server-side AI logic exists.

---

## State Persistence (quit and resume)

AI match state is authoritative on the server (Postgres), not on the device.

- **Human quits or disconnects:** server persists current match state to Postgres; Redis room cleared
- **Human resumes match:** client connects WS, server loads state from Postgres into Redis room, session continues from where it left off
- **Unfinished matches:** not recorded in match history; only completed matches are counted
- **Restart:** human can abandon and restart the AI match at any time; previous unfinished match is deleted

---

## Related

- Game plugin interface: [game-system.md#game-plugin-interface](../game-system.md#game-plugin-interface)
- WS events: [api-reference.md#websocket-events](../api-reference.md#websocket-events)
- DB: [database-schema.md#match_players](../database-schema.md#match_players) (`is_ai` flag for the AI seat)
