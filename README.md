# ZenStack Skills

[![skills.sh](https://skills.sh/b/zenstackhq/skills)](https://skills.sh/zenstackhq/skills)

A collection of [Agent Skills](https://skills.sh) that teach AI coding agents how to build
applications with [ZenStack V3](https://zenstack.dev) — the TypeScript database toolkit with a
Prisma-compatible API, a built-in access-control engine, and a Kysely query-builder escape hatch.

Install these skills so your agent (Claude Code, Cursor, Codex, Copilot, and
[70+ others](https://github.com/vercel-labs/skills#supported-agents)) writes correct, idiomatic
ZenStack code instead of guessing.

## Install

Install all skills into your project:

```bash
npx skills add zenstackhq/skills
```

Install into your user/global directory (available across all projects):

```bash
npx skills add zenstackhq/skills -g
```

List the available skills without installing:

```bash
npx skills add zenstackhq/skills --list
```

Install only specific skills, to specific agents:

```bash
npx skills add zenstackhq/skills --skill zenstack-schema-modeling --skill zenstack-querying -a claude-code
```

Use a skill once without installing (pipes a generated prompt into your agent):

```bash
npx skills use zenstackhq/skills@zenstack-access-control | claude
```

## Skills

| Skill | What it covers |
| ----- | -------------- |
| [`zenstack-project-setup`](skills/zenstack-project-setup/SKILL.md) | Installing ZenStack V3, scaffolding a project, the `zen` CLI, and the migration workflow. Migrating from Prisma or ZenStack V2. |
| [`zenstack-schema-modeling`](skills/zenstack-schema-modeling/SKILL.md) | Authoring `.zmodel` schemas: models, fields, relations, enums, custom types & mixins, polymorphism, typed JSON, and computed fields. |
| [`zenstack-access-control`](skills/zenstack-access-control/SKILL.md) | Access policies (`@@allow`/`@@deny`), the `auth()` function, field-level rules, post-update rules, and data validation. |
| [`zenstack-querying`](skills/zenstack-querying/SKILL.md) | Creating the `ZenStackClient`, the Prisma-compatible ORM API, relation queries, transactions, the Kysely query builder, and error handling. |
| [`zenstack-crud-server`](skills/zenstack-crud-server/SKILL.md) | Automatic CRUD web APIs ("Query as a Service"): RPC/REST handlers, server adapters (Express, Next.js, Fastify, Nuxt, SvelteKit, Hono, Elysia, TanStack Start), client SDKs (fetch-client, TanStack Query), and OpenAPI generation. |

All skills target **ZenStack V3** (the current major line). The full product documentation lives at
[zenstack.dev/docs](https://zenstack.dev/docs).

## Repository layout

```
skills/
  zenstack-project-setup/SKILL.md
  zenstack-schema-modeling/SKILL.md
  zenstack-access-control/SKILL.md
  zenstack-querying/SKILL.md
  zenstack-crud-server/SKILL.md
```

Each skill is a directory containing a `SKILL.md` file with YAML frontmatter (`name`,
`description`) followed by the instructions an agent loads on demand. This is the structure the
[`skills` CLI](https://github.com/vercel-labs/skills) and [skills.sh](https://skills.sh) discover.

## Contributing

To add a skill, create `skills/<skill-name>/SKILL.md` with `name` and `description` frontmatter and
add a row to the table above. Validate it locally before publishing:

```bash
npx skills add ./ --list
```

## License

[MIT](LICENSE)
