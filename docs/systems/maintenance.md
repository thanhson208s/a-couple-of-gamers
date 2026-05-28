# Maintenance Announcements

**Status:** Implemented

## Responsibility and Boundaries

This system describes server-side maintenance announcement state and realtime
delivery. It does not define operational maintenance procedures, or
deployment behavior.

| Concern | State or Effect Owner | Current Availability |
|---|---|---|
| Active announcement state | In-memory state in the API process handling the admin request. | Active, but not persisted. |
| Administrative mutation | Admin HTTP endpoints. | Active. |
| Realtime delivery | WebSocket gateway broadcasts and connection lifecycle dispatch. | Active for connected users. |
| Late-connection notification | Maintenance service registered as a WebSocket connection lifecycle handler. | Active while an announcement remains current in that API process. |

## Active Behavior

Administrators manage maintenance announcements through the admin interfaces
listed in the [API Reference](../api-reference.md#administration). The active
announcement is expressed as two millisecond values:

| Field | Meaning |
|---|---|
| `maintenanceAfter` | Relative delay until maintenance begins. |
| `maintenanceDuration` | Expected maintenance duration. |

Setting an announcement stores an in-memory deadline as
`Date.now() + maintenanceAfter`, then broadcasts `system:maintenance` to all
currently connected WebSocket clients. The response contains the same public
announcement shape sent to clients.

Reading the announcement returns the current relative
`maintenanceAfter` value and `maintenanceDuration`. If no announcement is
active, or if the stored deadline has passed, the read returns `null`.

## WebSocket Delivery

Connected users receive `system:maintenance` immediately when an administrator
sets a valid announcement. Users who connect later receive the same event during
WebSocket connection dispatch if the announcement is still active in that API
process.

Expired announcements are discarded before being returned by the admin read
endpoint or sent to a newly connected socket.

## Persistence and Process Scope

Maintenance announcement state is process-local memory. It is not stored in
PostgreSQL, Redis, or a BullMQ queue. Restarting an API process loses the active
announcement for that process, and multiple API processes can hold different
announcement state until an administrator updates each process through its own
request path or the deployment routes requests consistently.

Because the state is not durable delivery, clients should treat maintenance
events as advisory realtime notifications and rely on current server responses
for authoritative availability.

## Client Behavior Placeholder

First-party client behavior for how to consume the maintenance announcement.