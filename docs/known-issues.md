# Known Issues

Technical defect and incomplete-wiring register for currently implemented or
partially wired server behavior. This page records confirmed behavior found
while tracing runtime flows; it is not a roadmap or feature backlog.

An issue belongs here when it can produce incorrect observable behavior,
prevent an exposed flow from working, or leave runtime state inconsistent.
Protocol and storage definitions remain owned by the linked reference/system
pages.

## Incomplete Paths

| Area | Current Behavior | Consequence | Related Documentation |
|---|---|---|---|
| Tic-Tac-Toe start state | New matches initialize without an eligible first player. | The only currently registered game cannot advance through ordinary action submission. | [Match Runtime](systems/match-runtime.md#incomplete-runtime-paths) |

## Maintenance

- Remove an item when its described behavior is corrected or the incomplete
  path becomes available.
- Update an item only when its observable impact or correction boundary
  changes; do not track helper-level implementation work here.
- Do not add inactive feature ideas, product requirements, operational work,
  or defects that have already been fixed.
