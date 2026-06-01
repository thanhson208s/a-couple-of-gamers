# Game Catalog and Configuration

**Status:** Implemented

## Responsibility and Boundaries

This system determines which server game implementations are registered, which
persisted games are available for new matches, and which server-enforced limits
apply to account behavior.

| State or Decision | Authority | Consequence |
|---|---|---|
| Supported server game logic | Runtime plugin registry | A match cannot be initialized or processed without its registered plugin. |
| New-match availability and public catalog name | Persisted game catalog | Administrative availability and naming are independent of compiled game logic. |
| Version values and feature limits | Persisted configuration with runtime defaults | Account and match flows use the effective limits held by the application process. |
| Match state and gameplay delivery | [Match Runtime](match-runtime.md) | This system selects eligibility and logic; it does not own individual match lifecycle. |

## Catalog Responsibilities

The plugin registry and the persisted catalog have separate roles:

| Source | Responsibility |
|---|---|
| Game plugin registry | Supplies server game logic for supported slugs. |
| `games` table | Supplies administratively managed name and availability status. |

Catalog status values express availability:

| Status | Meaning for server behavior |
|---|---|
| `under_maintenance` | Retained in the catalog but cannot start a new match. |
| `coming_soon` | Retained in the catalog but cannot start a new match. |
| `enabled` | Eligible for new match creation if a registered plugin also exists. |
| `disabled` | Retained in the catalog but cannot start a new match. |

### Catalog Lifecycle

| Moment | Behavior |
|---|---|
| Application initialization | Every registered plugin slug is seeded into the catalog if missing, initially unavailable for new matches. Existing names and statuses are preserved. |
| Catalog/configuration read | All persisted catalog rows can be returned with their status, including unavailable games. |
| Pending match creation | The server resolves only an enabled catalog row, then requires registered plugin logic for that game. A catalog row alone is not executable behavior. |
| Existing joined match | Processing uses the game identity captured on the durable match and its registered plugin. A later catalog-status change does not stop it. |

The registry currently contains `tictactoe`, so it is the only game slug the
server can initialize and process for human matches. Its current gameplay
availability limitation is documented in
[Match Runtime](match-runtime.md#incomplete-runtime-paths).

## Configuration Behavior

Runtime configuration is stored as one configuration document. If no stored
row exists, server defaults apply. Each application process begins with
defaults in memory; server-side limit checks continue using those defaults
until configuration has been read or updated in that process. The authenticated
configuration read also includes the current game-status map.

The configuration currently controls:

- platform version values returned to consumers;
- favorites limits per account tier;
- friend limits per account tier;
- concurrent pending-plus-active match limits per account tier;
- invitee limits per pending match and account tier.

The fallback configuration reports minimum/latest version `1.0.0` for both
platforms and applies these limits:

| Tier | Favorites | Friends | Concurrent Matches | Invitees Per Match |
|---|---:|---:|---:|---:|
| `anonymous` | 2 | 0 | 1 | 1 |
| `social` | 10 | 100 | 5 | 5 |
| `dev` | 1,000,000,000 | 1,000,000,000 | 1,000,000,000 | 1,000,000,000 |

### Applying Configuration

| Consumer | Applied Rule |
|---|---|
| Favorites | A new favorite is refused once the selected tier's favorite limit is occupied. |
| Friendships | A new request is refused when either party's relationship-row count reaches that party's selected friend limit. |
| Pending match creation | A new invitation is refused when the creator's pending invitations plus active matches reach its selected concurrent-match limit. |
| Friend match invitations | Adding a new invitee to a pending match is refused once the creator's selected invitee-per-match limit is occupied. |
| Configuration consumers | The read projection adds current catalog statuses to version and limit configuration. |

Limit tier selection treats `anonymous` and `dev` specially; any other
authenticated provider uses the social tier. Changing a limit changes checks
on later operations; it does not remove existing favorites, relationships, or
matches.

Administrative mutation replaces the stored configuration document or updates
a catalog game's name/status. Replacing configuration updates the effective
in-memory value in the handling process and attempts to purge the cached
configuration response when cache-purge settings are present. Cache purge
failure is logged without rolling back the configuration update.

Effective enforcement configuration is kept in process memory. The current
deployment runs one API process, so an administrative configuration update
refreshes the same process that enforces later limits.

If the API is scaled to multiple simultaneously running processes, an
administrative update refreshes only the process handling that request. Other
already-running processes continue enforcing their current in-memory
configuration until they perform a configuration read or update. That
multi-process propagation behavior is an operational scaling boundary rather
than a defect in the current single-process deployment.

The active interface is defined in [API Reference](../api-reference.md), and
the stored representation is defined in [Database Schema](../database-schema.md).

## Game Plugin Contract

A registered plugin owns game-specific behavior while the match system owns
storage and delivery.

| Plugin Decision | Match Runtime Use |
|---|---|
| Construct initial state from game options | Stored when an invitation becomes an active durable match and used to create initial player views. |
| Apply an action as ordered transitions | The final transition state becomes cached active state; each transition is converted into each player's visible steps. |
| Produce a player-specific view | Allows hidden information to remain game-owned rather than exposed by match transport. |
| Identify eligible next players | Included in match-start, move, and turn updates. |
| Report completion and result | Causes durable completion and result-statistic effects. |

A plugin rejects invalid game actions through the match boundary. If it
returns no transitions for an accepted action, the current runtime returns
without persisting new state or delivering move/turn events; a plugin that
models deferred or simultaneous actions must account for that boundary.

## Client Behavior Placeholder

First-party client behavior for configuration consumption, catalog status
presentation, version handling, and compatible rendering of registered games
has not been implemented or verified in this repository.
