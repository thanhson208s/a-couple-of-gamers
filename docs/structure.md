# Repository Structure

Stable subsystem map for navigating the application. This page is not an
inventory of every source file and should change only when ownership or
top-level subsystem boundaries change, or when the recorded runtime
availability of a subsystem changes.

## Application Areas

| Path | Responsibility |
|---|---|
| `server/` | NestJS HTTP/WebSocket application, background worker bootstrap, game logic, and migrations. |
| `client/` | Godot mobile project. First-party behavior is currently limited to project configuration and a login scene scaffold; most contents are integration plugins/assets. |
| `admin/` | React/Vite administrative frontend shell; currently does not implement administrative workflows. |
| `dev/` | Browser-based local development console; present but configured against older API route shapes. |
| `docs/` | Application technical documentation described in [README](README.md). |

Operational scripts and environment/deployment files exist at repository root,
but are outside this technical behavior documentation set.

## Server Layout

| Path | Responsibility |
|---|---|
| `src/app.ts`, `src/app.module.ts` | API bootstrap and active application module graph. |
| `src/worker.ts`, `src/worker/` | Background worker bootstrap and job handling. |
| `src/common/` | Shared guards and external-client providers such as Redis and Firebase Admin. |
| `src/modules/` | Domain and transport subsystems listed below. |
| `src/logic/` | Game plugin contract and registered game implementations. |
| `src/migrations/` | Committed database migration authority. |

## Server Modules

| Module | Responsibility | Runtime Availability |
|---|---|---|
| `auth` | Firebase/development login and refresh token lifecycle. | Active |
| `users` | Profile, favorites, friendship, stats, deletion coordination. | Active |
| `games` | Catalog and game plugin registry access. | Active |
| `config` | Effective runtime configuration and configured limits. | Active |
| `matches` | Pending/active match lifecycle and realtime game behavior. | Active, with limitations in [Match Runtime](systems/match-runtime.md). |
| `ws` | Ticket endpoint and WebSocket gateway. | Active |
| `notifications` | Push delivery and reminder handling. | Partially implemented; see [Notification Delivery](systems/notification-delivery.md). |
| `admin` | Catalog/configuration administration endpoints. | Active |
| `dev` | Development-only helper endpoints. | Active only under development guard conditions. |
| `maintenance` | Maintenance announcement support. | No complete active flow. |
| `purchases` | Purchase integration placeholder. | No active behavior. |

## Client Surface

The checked-in client is a Godot project with a configured `LoginScene` and
third-party plugin integrations. No first-party network, authentication, match,
notification, or catalog flow is currently present to serve as documented
client behavior. System pages therefore use explicitly labeled client
placeholders.
