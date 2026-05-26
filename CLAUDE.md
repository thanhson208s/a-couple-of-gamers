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
- **No duplications**: Use markdown links to reference related sections from the docs folder.
- **Keep it concise**: Only document the abstract essentials, don't put all codebase in docs.
- **Runtime truth**: Technical docs describe implemented behavior; label partial or scaffolded paths explicitly.
- **Stable updates**: Update system docs for changed behavior or contracts, not internal helper/refactor churn.

### Document Index

| File | Purpose |
|------|---------|
| [docs/README.md](docs/README.md) | Technical documentation index, ownership, and status policy |
| [README.md](README.md) | Local development setup (install to run) |
| [docs/architecture.md](docs/architecture.md) | Application runtime components and subsystem boundaries |
| [docs/security.md](docs/security.md) | Authentication, authorization, rate limiting, validation, secrets |
| [docs/conventions.md](docs/conventions.md) | Project conventions and developer workflow |
| [docs/api-reference.md](docs/api-reference.md) | Active REST endpoints and WebSocket contracts |
| [docs/database-schema.md](docs/database-schema.md) | PostgreSQL and Redis state reference |
| [docs/structure.md](docs/structure.md) | Stable repository and subsystem map |
| [docs/systems/](docs/systems/) | Durable technical system behavior pages |
