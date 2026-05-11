## 0. Mandatory Rules

- **Docs First**: Always start from docs when planning a change.
- **Simplicity First**: Keep changes as simple as possible. Minimal code impact.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Only touch what's necessary. Avoid introducing bugs.

## 1. Task Workflow

1. Read all related docs
2. Identify related components
3. Modify only necessary code
4. Update docs if needed

## 2. Working with docs

### Core Principles
- **No duplications**: Use markdown link to reference related sections in the same or a different document.
- **Keep it concise**: Only document what necessary, don't put all codebase in docs.

### Document Index

| File | Purpose |
|------|---------|
| [docs/overview.md](docs/overview.md) | Project goals, tech stack, platforms, constraints |
| [docs/requirements.md](docs/requirements.md) | All functional and non-functional requirements with links to feature docs |
| [docs/architecture.md](docs/architecture.md) | System diagram, all services (internal + external), module responsibilities, key decisions |
| [docs/security.md](docs/security.md) | Auth mechanism (JWT lifecycle, WS ticket), rate limiting, input validation, secrets |
| [docs/infrastructure.md](docs/infrastructure.md) | Deployment topology, Docker Compose, external services, one-time VPS provisioning (first deploy, backup cron, runner install), CI/CD pipeline, monitoring |
| [README.md](README.md) | Local dev setup (install → run) |
| [docs/conventions.md](docs/conventions.md) | Code conventions and developer workflow — guards, errors, DTOs, modules, BullMQ jobs, entities, branching, commits, migrations, adding modules/games, publishing, PR checklist |
| [docs/api-reference.md](docs/api-reference.md) | [DRAFT] REST endpoints and WebSocket events |
| [docs/database-schema.md](docs/database-schema.md) | [DRAFT] Postgres tables, indexes, data ownership |
| [docs/game-system.md](docs/game-system.md) | Game plugin interface, state visibility, game catalog |
| [docs/hot-update.md](docs/hot-update.md) | OTA delivery for main-app (per-platform/per-minor tracks, two-gate version check) and per-game bundles (R2 manifest, download/play flow); CI publish and prune for both |
| [docs/features/](docs/features/) | One doc per feature — implementation flows, sequences, and task list. Covers: account-management, config-management, games-management, match-management, monetization, notifications, offline-mode, users-management |
| [docs/structure.md](docs/structure.md) | Living codebase map — every file and directory with its purpose |