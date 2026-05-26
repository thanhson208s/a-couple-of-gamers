# Application Architecture

This page describes application runtime boundaries only. Environment,
deployment, and operational procedures are maintained outside this
documentation set.

## Runtime View

```text
Godot client / development console / admin shell
                        |
                 HTTP + WebSocket
                        |
              NestJS API application
            /           |            \
    PostgreSQL        Redis          Firebase Admin
    durable data    transient     auth verification
                   state/queue        and FCM sends
                        |
                  BullMQ workers
```

## Components

| Component | Responsibility | Current State |
|---|---|---|
| NestJS API application | Active REST routes, user-scoped WebSocket gateway, match orchestration, catalog/configuration, identity/social behavior. | Active |
| PostgreSQL / TypeORM | Durable user, catalog, joined-match, configuration, token, social, and device-token data. | Active; see [schema drift](database-schema.md#material-drift). |
| Redis | Pending invitations, realtime match cache/presence/replay, WS tickets, HTTP/WS rate state, and BullMQ backing state. | Active |
| Firebase Admin | Firebase ID token verification and FCM send capability. | Auth active; push trigger availability is partial. |
| BullMQ maintenance handling | Processes queued maintenance announcement work in the API runtime. | No complete application-triggered announcement flow is active. |
| BullMQ worker process | Hosts background reminder and stale-match cleanup work. | Reminder delivery and stale-match cleanup currently have no live effect. |
| Godot client | Mobile client project and third-party integration plugins. | Project scaffold/login scene only; server interaction is not verified. |
| Development console | Local browser tool intended to exercise server behavior. | Present, but its route configuration is stale relative to current API. |
| Admin application | Administrative web frontend shell. | Does not yet implement configuration operations. |

## Server Subsystems

| Subsystem | Boundary |
|---|---|
| Authentication and guards | Authenticates Firebase users, rotates application sessions, and enforces JWT/admin/development access. |
| Users | Owns identity projection, favorites, friendships, result statistics, and account-deletion callbacks. |
| Games and configuration | Owns plugin registration, persisted game availability, configuration defaults, and administrative mutations. |
| Matches | Owns invite-to-result lifecycle and coordinates game logic, cache state, realtime events, statistics, and friend-invite push attempts. |
| WebSocket gateway | Authenticates tickets, routes registered inbound events, limits WS activity, and targets outbound messages by user. |
| Notifications | Manages authenticated FCM device tokens and sends invitation pushes; reminder delivery remains unavailable through active flows. |
| Maintenance | No complete application-facing maintenance announcement flow is active. |
| Purchases | No active application purchase behavior. |

## Technical System Pages

- [Identity and Social State](systems/identity-social.md)
- [Game Catalog and Configuration](systems/game-config.md)
- [Match Runtime](systems/match-runtime.md)
- [Notification Delivery](systems/notification-delivery.md)

Public protocol contracts, storage, and enforcement boundaries remain owned by
[API Reference](api-reference.md), [Database Schema](database-schema.md), and
[Security](security.md), respectively.
