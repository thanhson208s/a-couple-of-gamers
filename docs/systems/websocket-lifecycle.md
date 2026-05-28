# WebSocket Lifecycle

**Status:** Implemented

## Responsibility and Boundaries

This system describes the server-side lifecycle of the user-scoped WebSocket
connection. Event payload contracts remain in the
[API Reference](../api-reference.md#websocket-protocol), authentication and
rate limits remain in [Security](../security.md), and Redis key ownership is
listed in [Database Schema](../database-schema.md#redis-keys).

| Concern | WebSocket Lifecycle Responsibility | Related Owner |
|---|---|---|
| Connection admission | Consume one-time tickets and reject unavailable or unauthenticated sockets. | Ticket issuance is an authenticated HTTP endpoint. |
| Active socket ownership | Keep at most one active socket per authenticated user for targeted delivery. | Match, notification, and maintenance systems send through this gateway. |
| Lifecycle dispatch | Invoke registered connection and disconnection handlers. | Handlers are registered by feature modules with WebSocket decorators. |
| Message dispatch | Parse envelopes, apply per-event throttling and DTO validation, and call registered handlers. | Domain behavior is owned by the receiving feature module. |
| Shutdown drain | Stop accepting new sockets and close existing sockets with a bounded graceful drain. | Process shutdown is initiated outside this subsystem. |

## Connection Lifecycle

Clients open `/v1/ws?ticket=<ticket>` using a ticket returned by
`POST /v1/ws/ticket`. Tickets are random Redis-backed values that expire after
60 seconds and are deleted on successful validation, so a ticket can be used
only once.

| Stage | Behavior |
|---|---|
| Shutdown gate | If application shutdown has started, the server rejects the new socket with close code `1001` and reason `server_shutdown`. |
| Ticket check | Missing tickets close with code `4401` and reason `Missing ticket`; unknown, reused, or expired tickets close with code `4401` and reason `Invalid ticket`. |
| Existing socket replacement | If the authenticated user already has a socket in the client map, the server asks that older socket to close with application close code `4000` and reason `Another device`. |
| Replacement timeout | The server waits up to three seconds for the older socket's close event. If the older socket does not close in time, the server terminates it. |
| New active socket | After the older socket is closed or terminated, the server records the new socket as the user's active socket, attaches the message listener, and dispatches connection handlers. |

## Disconnect Lifecycle

The client map is keyed by user ID. Disconnect handling removes a socket only
when that socket is still the current mapped socket for the user. This prevents
an older socket's delayed close event from clearing a newer replacement socket.

When the current active socket disconnects, the gateway removes it from the
client map and dispatches registered disconnection handlers. Match runtime uses
that dispatch to flush open-match state, report opponent disconnection, and
schedule turn reminders when applicable.

## Message Dispatch

Inbound messages must be JSON objects with a string `event` field. Unknown
events, malformed JSON, and envelopes without a string event are ignored.

| Stage | Behavior |
|---|---|
| `ping` | Bypasses throttling and replies to the active user socket with `{ "event": "pong" }`. |
| Handler lookup | Registered handlers are discovered from provider methods decorated for the event. Events with no registered handlers are ignored. |
| Throttle check | Registered non-`ping` events are throttled by authenticated user ID and event name. Throttled messages receive `{ "event": "<request-event>", "error": 429 }`. |
| DTO validation | Events with a registered DTO run through the validation pipe with whitelist and non-whitelisted-property rejection. Invalid payloads receive `{ "event": "<request-event>", "error": 400 }`. |
| Handler invocation | Valid payload data is merged with `{ userId }` and passed to all handlers registered for the event. |

## Outbound Delivery

Targeted sends use the active socket from the user client map. If the mapped
socket is missing or not open, the send is skipped. Because the map stores one
socket per user, replacement affects all future user-targeted domain messages.

Broadcast sends iterate every open socket held by the WebSocket server. Current
broadcast uses include realtime maintenance announcements.

## Shutdown Lifecycle

On application shutdown, the gateway marks itself as shutting down so new
connections are rejected. It then asks each connected socket to close with
code `1001` and reason `Server shutdown`.

The gateway waits up to five seconds per socket for the close handshake. Any
socket that does not close within that window is terminated.

## Client Behavior Placeholder

First-party client behavior for reconnect timing, replacement handling,
close-code interpretation, and message replay after reconnect has not been
implemented or verified in this repository.
