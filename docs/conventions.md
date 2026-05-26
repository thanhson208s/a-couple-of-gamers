# Engineering Conventions

Conventions for application development and technical documentation. Start at
the [documentation index](README.md) when changing system behavior.
Local environment setup is in the repository [README](../README.md).

## Contents

- [Documentation Ownership](#documentation-ownership)
- [Git Workflow](#git-workflow)
- [Server Boundaries](#server-boundaries)
- [Game Logic](#game-logic)
- [Persistence](#persistence)
- [Background Jobs](#background-jobs)
- [Adding a Module](#adding-a-module)
- [Testing](#testing)
- [Change Checklist](#change-checklist)

## Documentation Ownership

| Change | Documentation Owner |
|---|---|
| HTTP route or WebSocket protocol contract | [API Reference](api-reference.md) |
| Persisted table, relation, Redis key, or storage authority | [Database Schema](database-schema.md) |
| Authentication, authorization, validation, or throttling enforcement | [Security](security.md) |
| Confirmed observable defect, consistency hazard, or incomplete wired path | [Known Issues](known-issues.md) |
| Runtime component or subsystem ownership boundary | [Architecture](architecture.md) or [Structure](structure.md) |
| Cross-endpoint state transition or integration behavior | Relevant page under [systems/](systems/) |

Documentation describes current technical behavior. It does not own product
requirements, client UX specifications, infrastructure, deployment, or
operational runbooks.

Use Markdown filenames with at most two descriptive words, separated by
hyphens when needed.

### When System Docs Change

Update a system page when changing:

- state lifecycle or state ownership;
- a runtime availability boundary;
- a server-enforced rule or externally observable failure condition;
- an integration effect such as a realtime event or push trigger;
- client integration responsibilities already documented as a contract.

Do not update a system page only because an internal helper, service
organization, filename, test, or implementation technique changes without
changing behavior.

Use the status terms `Implemented`, `Partially implemented`, and `Scaffolded`
as defined in [README](README.md#status-labels). Do not state planned behavior
as live. A `Client Behavior Placeholder` describes only an unverified
integration counterpart; it must not invent UI or product requirements.

## Git Workflow

Use short-lived branches for a single change and merge them through review
into `main`. Release and deployment procedures are maintained outside this
technical documentation set.

Use [Conventional Commits](https://www.conventionalcommits.org/) with a useful
optional scope:

```text
feat(server): add game availability check
fix(db): align friendship timestamp migration
docs: describe match runtime limits
test(server): cover refresh token reuse
chore(client): update project plugin
```

## Server Boundaries

### Transport and Authentication

- Controllers define transport boundaries and delegate behavior to services.
- New interfaces must make an explicit authentication decision: authenticated
  user, administrator, development-only, or deliberately public.
- Reuse the established authentication guards for those boundaries and update
  [Security](security.md) when enforcement changes.
- Add or change HTTP and WebSocket contracts in
  [API Reference](api-reference.md).

| Boundary | Established Guard |
|---|---|
| Authenticated application user | `JwtAuthGuard` |
| Administrative mutation | `AdminAuthGuard` |
| Local-development-only interface | `DevAuthGuard` |

Import these guards through `GuardsModule` in a module that owns protected
controllers. Interfaces intentionally left public should make that decision
clear during review. Authenticated handlers should consume the verified user
through the established `@CurrentUser()` decorator rather than parsing
authorization headers themselves.

### DTOs and Validation

Request bodies and structured WebSocket data that are part of a supported
contract should use DTO classes with `class-validator`. Inline TypeScript
types do not provide runtime validation.

DTO conventions:

- name files `<action>-<resource>.dto.ts`;
- colocate a DTO with its transport-owning module;
- validate every externally supplied field and nested object.

Use schemas for new contracts even where an existing interface is known to
lack runtime validation; that existing gap is documented in
[Security](security.md#input-validation).

### Error Handling

Services and controllers must express request-visible failures as NestJS HTTP
exceptions.

| Failure | Exception |
|---|---|
| Missing resource | `NotFoundException` |
| Malformed or invalid operation | `BadRequestException` |
| Authenticated user lacks permission | `ForbiddenException` |
| Conflicting existing state | `ConflictException` |
| Missing or invalid credentials | `UnauthorizedException` |

Game plugins may reject invalid game actions with ordinary errors because they
are transport-independent. Match orchestration must translate those failures
into request-visible HTTP/WebSocket errors.

### Module Communication

- A module exposes behavior to other modules through exported providers.
- Prefer calling an owning module's service over directly querying its
  persistence entities.
- Cross-module entity imports are acceptable when TypeORM relationships or an
  explicitly owned persistence operation require the entity class.
- If two domains begin to require each other extensively, extract the shared
  ownership boundary rather than growing circular dependencies.

## Game Logic

Server-supported human matches execute through the game plugin contract:
initialize state, apply actions, produce per-player views, return eligible
turns, and resolve completion. Registering a new game requires both a plugin
registry entry and a persisted catalog row created through startup seeding.

Changes to plugin lifecycle semantics or the match/plugin division of
responsibility belong in
[Game Catalog and Configuration](systems/game-config.md)
and [Match Runtime](systems/match-runtime.md). Game-specific algorithm details
belong in code unless they alter a public/system contract.

### Adding a Server-Supported Game

1. Implement the game plugin contract under `server/src/logic/<slug>/`.
2. Register the game slug in the server registry. Startup catalog seeding
   creates a missing persisted catalog row in the unavailable-by-default state.
3. Enable the persisted catalog game only when new server matches may be
   created for it.
4. Update system documentation only if the plugin contract, availability
   behavior, or match lifecycle changes.
5. Add a `Client Behavior Placeholder` update if the server contract creates a
   new unverified client integration responsibility.

## Persistence

- TypeORM migrations are the deployed schema authority; review generated
  migrations against entity intent before treating behavior as available.
- Entity additions or changes that require storage must be paired with a
  migration before their behavior is documented as implemented.
- Redis entries that hold system state or define expiration/consistency rules
  must be documented in [Database Schema](database-schema.md); incidental
  cache implementation detail need not be listed.
- Use TypeORM parameter binding for data access; do not concatenate
  externally supplied values into raw SQL.

### Entity Conventions

- Persisted TypeORM entities use the `*.entity.ts` suffix because the
  configured data source loads that pattern.
- Keep entity ownership with the module that owns the persisted concept.
- Use migration names that state the storage change, such as
  `CreateInitialSchema` or `AddMatchIndex`.

### Database Migrations

From the repository root, use the development environment commands:

```bash
npm run migration:generate:dev -w server -- src/migrations/<MigrationName>
npm run migration:run:dev -w server
npm run typeorm:dev -w server -- migration:revert -d src/app.data.ts
```

For non-development execution, use the corresponding `migration:generate` and
`migration:run` scripts with the required environment already supplied.
Review generated SQL before committing it. Do not document an entity-backed
behavior as implemented until its migration is available and consistent.

### Adding Persisted State

1. Add or change the owning entity.
2. Generate and review a migration.
3. Apply the migration locally and run relevant tests.
4. Update [Database Schema](database-schema.md) for persisted contract changes.
5. Update a system page only when storage ownership, lifecycle, or externally
   relevant behavior changes.

## Background Jobs

Queue-backed behavior should be designed for retries and delayed execution:

- processors must be idempotent;
- processors must re-check that a job is still relevant before applying an
  effect;
- deterministic job identifiers should be used when work must be cancelled or
  deduplicated;
- retriable failures should be thrown so queue retry policy can apply;
- expected no-op conditions should complete successfully rather than retry.

Queue registration or processor presence alone does not establish a live
system behavior. Document availability based on an end-to-end runtime trigger
and effect.

## Adding a Module

Use Nest generators from `server/` when introducing a new NestJS domain:

```bash
npx nest g module modules/<name>
npx nest g controller modules/<name> --no-spec
npx nest g service modules/<name> --no-spec
```

After generation:

1. Register the module only in the runtime entrypoints that need its behavior.
2. Register owned entities and queues where applicable.
3. Apply an explicit authentication boundary to any new transport interfaces.
4. Export providers only when another module requires the behavior.
5. Add tests and update the owning technical docs for changed contracts.

## Testing

Server unit tests use Jest and colocated `*.spec.ts` files. Exercise behavior
at the service/guard boundary for new rules, error cases, and state
transitions.

Run server verification from the repository root:

```bash
npm test --workspace=server
npm run test:cov --workspace=server
npm run test:watch --workspace=server
npx tsc --noEmit --project server/tsconfig.json
```

For service tests, mock repository and dependent-service boundaries rather
than reproducing database behavior inside each unit test. For guard tests,
construct only the request context required for the rule being tested.

Testing changes alone do not require system documentation changes unless they
expose that the documented runtime behavior was incorrect.

## Change Checklist

- [ ] New transport interfaces have an explicit authentication decision.
- [ ] New structured input contracts have runtime validation schemas.
- [ ] Request-visible failures use transport-appropriate NestJS exceptions.
- [ ] Behavioral changes have focused tests for their normal and failure paths.
- [ ] Active interface changes are reflected in `api-reference.md`.
- [ ] Persistence changes are reflected in `database-schema.md` and backed by a migration where required.
- [ ] Security-boundary changes are reflected in `security.md`.
- [ ] System documentation changes only where runtime behavior or ownership changed.
- [ ] Incomplete or unwired code is labeled instead of documented as available behavior.
