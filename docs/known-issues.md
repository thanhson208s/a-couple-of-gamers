# Known Issues

Technical defect and incomplete-wiring register for currently implemented or
partially wired server behavior. This page records confirmed behavior found
while tracing runtime flows; it is not a roadmap or feature backlog.

An issue belongs here when it can produce incorrect observable behavior,
prevent an exposed flow from working, or leave runtime state inconsistent.
Protocol and storage definitions remain owned by the linked reference/system
pages.

## Incorrect Behavior

| Area | Current Behavior | Consequence | Related Documentation |
|---|---|---|---|
| Health endpoint | The health response reports database and cache state as `ok` without probing either dependency. | Health consumers can receive a healthy response while runtime dependencies are unavailable. | [API Reference](api-reference.md#health) |

## Consistency Hazards

| Area | Current Behavior | Consequence | Related Documentation |
|---|---|---|---|
| Friendship persistence | The committed migration and the runtime friendship entity disagree on relationship timestamp columns. | Friendship reads or mutations against the migrated schema can fail. | [Database Schema](database-schema.md#material-drift), [Identity and Social State](systems/identity-social.md#friendships) |
| Account deletion atomicity | Match/cache cleanup, local user removal, and Firebase identity deletion are sequential effects rather than one transaction; failures are reported as authorization failure. | An account deletion request can fail after some cleanup or deletion effects have already occurred. | [Identity and Social State](systems/identity-social.md#account-deletion) |
| Invitation join handoff | Joining deletes the Redis invitation before the durable active match is saved. | A failed durable save can lose an otherwise valid invitation without creating a match. | [Match Runtime](systems/match-runtime.md#invitation-flow) |
| Match player retention | The committed schema has no user foreign keys on durable match player IDs, despite the runtime model indicating deleted participants should become null. | Account deletion can leave deleted user identifiers in historical match records. | [Database Schema](database-schema.md#material-drift) |
| Runtime configuration propagation | Feature-limit enforcement uses in-memory configuration in each API process; an administrative update refreshes only the process handling that update until another process performs a configuration read or update. | When more than one API process is running, simultaneous requests can be enforced under different limits. | [Game Catalog and Configuration](systems/game-config.md#applying-configuration) |
| Transport validation coverage | Some active structured inputs are handled without a runtime validation schema. | Malformed or unexpected input is not consistently rejected at the transport boundary. | [Security](security.md#input-validation) |

## Incomplete Paths

| Area | Current Behavior | Consequence | Related Documentation |
|---|---|---|---|
| Tic-Tac-Toe start state | New matches initialize without an eligible first player. | The only currently registered game cannot advance through ordinary action submission. | [Match Runtime](systems/match-runtime.md#incomplete-runtime-paths) |
| Friend-invite delivery ordering | Match invitation delivery awaits the FCM send before attempting the realtime socket event. | An FCM exception fails the request and prevents realtime delivery even though the underlying pending invitation remains valid. | [Notification Delivery](systems/notification-delivery.md#friend-invitation-delivery) |
| Maintenance announcements | Maintenance queue processing can broadcast an externally submitted schedule, but no complete application trigger is exposed and late-connection notification is not connected to the gateway's connection dispatch. | Maintenance announcements cannot be relied on as a complete active application flow. | [Architecture](architecture.md#server-subsystems), [Structure](structure.md#server-modules) |

## Maintenance

- Remove an item when its described behavior is corrected or the incomplete
  path becomes available.
- Update an item only when its observable impact or correction boundary
  changes; do not track helper-level implementation work here.
- Do not add inactive feature ideas, product requirements, operational work,
  or defects that have already been fixed.
