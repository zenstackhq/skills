---
name: zenstack-project-setup
description: Set up, configure, and manage a ZenStack V3 project. Use when installing ZenStack, scaffolding a new project, running the `zen` CLI (generate, db push, migrate), managing database migrations, or configuring logging. (To migrate a Prisma project use zenstack-migrate-from-prisma; to upgrade from ZenStack V2 use zenstack-migrate-from-v2.)
---

# ZenStack V3 — Project Setup & Migrations

ZenStack V3 is a TypeScript database toolkit with a Prisma-compatible ORM API built on
[Kysely](https://kysely.dev) (no Rust/WASM). The schema is written in **ZModel** (`.zmodel`), a
superset of the Prisma schema language. This skill covers installing, scaffolding, the CLI, and
migrations. For schema syntax see `zenstack-schema-modeling`; for queries see `zenstack-querying`;
for access control see `zenstack-access-control`.

> Always confirm exact package versions and commands against the live docs at
> https://zenstack.dev/docs when something looks off — V3 evolves quickly.

## Prerequisites

- **Node.js** v20+
- **TypeScript** v5.8.0+
- VSCode extension: "ZenStack V3" (language id `zmodel-v3`) — distinct from the V2 extension.

## Installing

### Scaffold a new project (recommended)

```bash
npm create zenstack my-project
```

### Initialize ZenStack in an existing project

```bash
npx @zenstackhq/cli zen init
```

Then create `zenstack/schema.zmodel` and run `zen generate`.

### Manual install

```bash
npm install @zenstackhq/schema @zenstackhq/orm
npm install --save-dev @zenstackhq/cli
```

ZenStack does **not** bundle database drivers — install one yourself:

| Database   | Install |
| ---------- | ------- |
| PostgreSQL | `npm install pg` + `npm install -D @types/pg` |
| MySQL      | `npm install mysql2` |
| SQLite     | `npm install better-sqlite3` + `npm install -D @types/better-sqlite3` |

Add access control only if needed: `npm install @zenstackhq/plugin-policy` (see
`zenstack-access-control`).

## Project structure

- **Schema**: `zenstack/schema.zmodel` (default; override with `--schema`).
- **Generated output**: emitted next to the schema (override with `--output`). Import it as
  `import { schema } from './zenstack/schema'`.
- You may commit the generated TypeScript, or `.gitignore` it and run `zen generate` in CI.

## The `zen` CLI

The CLI is invoked as `zen` (or `zenstack` — equivalent). Add scripts to `package.json`:

```json
{
  "scripts": {
    "generate": "zen generate",
    "db:push": "zen db push",
    "migrate:dev": "zen migrate dev",
    "migrate:deploy": "zen migrate deploy"
  }
}
```

| Command | Purpose |
| ------- | ------- |
| `zen generate` | Compile `schema.zmodel` → TypeScript. **Run after every schema change**, before using the client. Flags: `--schema <path>`, `--output <path>`. |
| `zen db push` | Push schema to the DB **without** a migration file. Dev/testing only — never in production. |
| `zen db pull` | Introspect an existing DB and update the ZModel schema (v3.4.0+, experimental). Can overwrite your schema — back up / use source control first. |
| `zen migrate dev` | Create a migration from schema changes and apply it (dev only). `--create-only` makes an empty migration to edit by hand (e.g. for views). |
| `zen migrate deploy` | Apply all pending migrations. Use this in your production/deploy pipeline. |
| `zen migrate reset` | Drop all tables and reapply migrations. Dev/testing only. |
| `zen migrate status` | Show applied vs. pending migrations. |
| `zen migrate resolve` | Mark a migration applied/rolled-back without changing the schema (manual recovery). |

> Migration commands wrap Prisma Migrate; `@zenstackhq/cli` has a peer dependency on `prisma` that
> is installed automatically when needed.

## Workflows

**Development loop**

1. Edit `zenstack/schema.zmodel`.
2. `zen generate` (regenerate types).
3. `zen db push` to try changes locally without a migration, *or* `zen migrate dev` to create a
   reviewable, committable migration file.
4. Review the migration SQL, then commit it.

**Production deploy**

```bash
zen migrate deploy
```

**Adopt ZenStack on an existing database**

1. `zen init`
2. Set the datasource `url` in `zenstack/schema.zmodel`.
3. `zen db pull` to generate the schema from the DB.
4. Refine it (add access policies, computed fields, etc.).
5. `zen generate`.

## Migrating from Prisma

See the dedicated `zenstack-migrate-from-prisma` skill — it walks through swapping dependencies,
converting `schema.prisma` to ZModel, replacing `PrismaClient` with `ZenStackClient`, updating the
generate/migrate scripts, and mapping Prisma custom generators and client extensions.

## Migrating from ZenStack V2

See the dedicated `zenstack-migrate-from-v2` skill — it covers the package renames, moving access
control to the policy plugin, the `future()` → `post-update`/`before()` change, abstract models →
types+mixins, the `getPrisma` → `getClient` server-adapter change, and the client-side hook
migration.

## Logging

```ts
const db = new ZenStackClient(schema, {
    dialect,
    log: ['query', 'error'],
    // or a function:
    // log: (event) => console.log(`[${event.level}] ${event.queryDurationMillis}ms`),
});
```

The `log` option is forwarded to the underlying Kysely instance.
