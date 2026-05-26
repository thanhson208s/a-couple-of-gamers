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

### Document Index

| File | Purpose |
|------|---------|
| [README.md](README.md) | Tech stack + Local dev setup (install → run) |
| [docs/architecture.md](docs/architecture.md) | System diagram, all services and responsibilites |
| [docs/security.md](docs/security.md) | Auth mechanism, rate limiting, input validation, secrets |
| [docs/conventions.md](docs/conventions.md) | Project conventions and developer workflow |
| [docs/api-reference.md](docs/api-reference.md) | REST endpoints and WebSocket events |
| [docs/database-schema.md](docs/database-schema.md) | Postgres tables, indexes, cache keys with description |
| [docs/structure.md](docs/structure.md) | Map of every file and directory with its purpose |
| [docs/features/*](docs/features/) | Technical docs per feature, document system behaviors |