# Technical Documentation

This documentation describes the current application runtime, with the NestJS
server as the primary implemented behavior surface. It is not a product
requirements set, roadmap, or operations runbook.

## Navigation

| Document | Owns |
|---|---|
| [Architecture](architecture.md) | Application runtime components and subsystem boundaries |
| [API Reference](api-reference.md) | Active HTTP and WebSocket interfaces |
| [Database Schema](database-schema.md) | PostgreSQL schema, Redis key reference, and material persistence drift |
| [Security](security.md) | Authentication, authorization, throttling, and validation boundaries |
| [Known Issues](known-issues.md) | Confirmed observable defects, consistency hazards, and incomplete wired paths |
| [Structure](structure.md) | Stable repository and subsystem map |
| [Conventions](conventions.md) | Engineering and documentation maintenance rules |
| [Identity and Social State](systems/identity-social.md) | Accounts, favorites, friendships, stats, and deletion effects |
| [Game Catalog and Configuration](systems/game-config.md) | Game availability, runtime configuration, and plugin responsibilities |
| [Match Runtime](systems/match-runtime.md) | Invite-to-completion match lifecycle and realtime state handling |
| [Notification Delivery](systems/notification-delivery.md) | Push-delivery boundary and currently incomplete notification paths |

## Status Labels

| Status | Meaning |
|---|---|
| `Implemented` | The described behavior is wired into the running application. |
| `Partially implemented` | Some behavior is live, but a documented runtime path is incomplete or unavailable. |
| `Scaffolded` | Some implementation support exists, but it is not exposed as usable application behavior. |

Purchases and maintenance announcements are currently scaffolded or
incompletely triggered and therefore do not receive standalone system pages.

## Maintenance Rules

- Document implemented behavior as fact; label incomplete wiring explicitly.
- Put route payloads in the [API Reference](api-reference.md), persisted shapes
  in the [Database Schema](database-schema.md), and auth/security enforcement in
  [Security](security.md). System pages link to these sources instead of
  reproducing them.
- Update system pages when a contract, state transition, persistence rule,
  integration boundary, runtime availability, or observable failure behavior
  changes.
- Do not update system pages solely for helper functions, internal refactors,
  renamed files, added tests, or other changes that preserve behavior.
- Client sections are placeholders for integration responsibilities only until
  first-party client behavior is implemented and verified.
