## 0. Mandatory Rules

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
| [docs/infrastructure.md](docs/infrastructure.md) | Deployment topology, Docker Compose, CI/CD, migrations, backup, monitoring |
| [docs/workflow.md](docs/workflow.md) | Local dev setup, branching, commit conventions, how-to guides |
| [docs/api-reference.md](docs/api-reference.md) | [DRAFT] REST endpoints and WebSocket events |
| [docs/database-schema.md](docs/database-schema.md) | [DRAFT] Postgres tables, indexes, data ownership |
| [docs/game-system.md](docs/game-system.md) | Game plugin interface, state visibility, AI integration, game catalog |
| [docs/features/](docs/features/) | One doc per feature — implementation flows and sequences (mirrors requirements.md) |