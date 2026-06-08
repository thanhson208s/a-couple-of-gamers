# Identity and Social State

**Status:** Implemented

## Responsibility and Boundaries

This system owns server user identities, account-linked social state, and
statistics derived from completed matches. Authentication enforcement and
token handling are defined in [Security](../security.md); HTTP and WebSocket
interfaces are listed in the [API Reference](../api-reference.md).

| Concern | Owned Here | Owned Elsewhere |
|---|---|---|
| User identity state | Mapping a verified identity to an application user and maintaining profile-facing provider state. | Verification, credentials, and session renewal are owned by [Security](../security.md). |
| Social state | Favorites, friend-request transitions, accepted friendship checks, and match-derived statistics. | Match invitations after friendship is established are owned by [Match Runtime](match-runtime.md). |
| Account removal | Coordinating dependent match cleanup before removing the account. | Physical relationships and deletion constraints are owned by [Database Schema](../database-schema.md). |

## Runtime Behavior

### Identity Lifecycle

| Transition | Persisted Effect | Profile Effect |
|---|---|---|
| Firebase login for an unknown UID | Creates a user linked to that Firebase UID and its current sign-in provider. | Uses the Firebase display name when available; otherwise derives a name from email or the generated application ID. |
| Firebase login for a known UID with the same provider | Reuses the existing application user without rewriting it. | Existing name and avatar remain unchanged. |
| Firebase login for a known UID with a changed provider | Updates the provider attached to the existing application user. | When changing to a social provider, available Firebase name/avatar values update the profile. Anonymous, password, and development provider transitions do not overwrite them. |
| Development login | Creates or reuses a user keyed by the supplied development account ID. | New development accounts receive their development display name. |

The server-generated user ID is a 10-character identifier formed from
unambiguous uppercase letters and digits. It remains stable across Firebase
provider transitions and is used in social state. Provider identifiers remain
authentication linkage rather than social-facing identifiers.
Deleted user IDs and provider IDs are reserved by grave rows and are not
reissued during later login or development-account creation.

### Profile and Favorites

The profile projection combines account profile state with favorited game IDs
and the current favorite limit for that account tier.

| Operation | Rule | State Effect |
|---|---|---|
| Read profile | Authenticated user must still exist. | Returns current account projection and favorites without changing state. |
| Add favorite | The catalog game must exist. Availability status is not consulted, so an unavailable catalog game can be favorited. | Creates a favorite only if absent. Adding an existing favorite is a no-op and consumes no further capacity. |
| Remove favorite | No prior favorite is required. | Deletes the relationship if present; otherwise it is a no-op. |

A new favorite is rejected once the user's account-tier favorite limit is
occupied. The check applies to new additions rather than removing stored
favorites when configuration changes.

### Friendships

Friendship is represented by one directional request row which changes from
`pending` to `accepted`.

| Transition | Preconditions | State and Integration Effect |
|---|---|---|
| Send request | Sender is not anonymous; addressee exists; parties differ; no relationship exists in either direction; both parties have remaining friend capacity. | Creates a directional pending row. A connected recipient receives `friend:request`. |
| Accept request | The caller is the addressee of an existing pending row. | Changes that row to `accepted`. A connected requester receives `friend:accept`. |
| Cancel outgoing request | Caller is interpreted as the requester. | Removes a matching pending row if present; otherwise no state changes. |
| Reject incoming request | Caller is interpreted as the addressee. | Removes a matching pending row if present; otherwise no state changes. |
| Remove friend | No error is required when the relationship is absent. | Removes accepted state in either stored direction. |

The friend limit counts relationship rows involving a user, including pending
requests as well as accepted friendships. Pending incoming or outgoing
requests therefore consume capacity until accepted or deleted.

Accepted friendships authorize direct match invitations; the invitation and
match behavior are documented in [Match Runtime](match-runtime.md).

### Rival Statistics

When game processing completes a match, the result is applied from both
players' perspectives for that game and opponent pair. In competitive play,
one player's win is the other's loss and a draw increments both draw counts.
The plugin game type also allows cooperative results to be counted
consistently for both players.

Overall statistics aggregate the caller's perspective across opponents by
game. Abandoned matches, including abandonment during account deletion, do
not update results. Statistics therefore represent completed game results
rather than every stored match participation.

### Account Deletion

Deletion requires a recently authenticated Firebase identity. If that
Firebase identity resolves to an application user, it must be the
authenticated caller's user. A recently authenticated Firebase identity that
has no application-user mapping is deleted as orphaned Firebase state, but it
does not authorize deletion of the caller's application account.

| Phase | Behavior |
|---|---|
| Reauthentication check | The supplied Firebase identity token is verified with revocation checking and must be recently issued. A UID mapped to another application user is rejected without deletion. A UID with no application-user mapping is removed from Firebase and the account-deletion request is rejected. |
| Grave creation | Before the user row is deleted, a grave row is created with the Firebase UID and active-match cleanup inputs needed by the worker. |
| Account removal | After the verified UID resolves to the authenticated caller, the application user row is deleted. Committed match rows involving the deleted user are removed by database cascade. The same Firebase identity is then deleted immediately on a best-effort basis. |
| Deferred external cleanup | The cleanup worker processes unprocessed graves by removing invitation/open-match Redis indexes, deleting match-scoped cache/replay keys captured in the grave payload, cancelling reminder jobs for captured match participants, retrying Firebase identity deletion, and marking the grave processed. |

Deletion coordinates PostgreSQL state and immediate Firebase removal
sequentially, not as one cross-system transaction. Redis, reminder, replay,
and retry Firebase cleanup are deferred through durable grave rows. If a later
external operation fails, the grave remains unprocessed and is retried by the
worker. Removing an orphaned Firebase identity is also an intentional
best-effort side effect of a deletion request that fails authorization for the
local account.

Persistence details and current schema constraints are documented in
[Database Schema](../database-schema.md).

## Configuration Effects

Favorites, friendships, and concurrent match creation apply account-tier
limits from runtime configuration.

| Provider Classification | Limit Tier |
|---|---|
| `anonymous` | Anonymous limits |
| `dev` | Development limits |
| All other authenticated providers | Social limits |

These limits gate new additions or invitations; they do not proactively remove
stored social state after a lower configuration value takes effect.
Configuration ownership and its process-local effective state are described in
[Game Catalog and Configuration](game-config.md).

## Client Behavior Placeholder

First-party client behavior for login token consumption, profile/favorite and
friend state synchronization, realtime social events, and account deletion has
not been implemented or verified in this repository.
