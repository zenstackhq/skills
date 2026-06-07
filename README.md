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
| [`zenstack-project-setup`](skills/zenstack-project-setup/SKILL.md) | Installing ZenStack V3, scaffolding a project, the `zen` CLI, and logging. |
| [`zenstack-db-migration`](skills/zenstack-db-migration/SKILL.md) | Database schema migrations: `zen migrate dev/deploy/reset/status/resolve`, `db push`/`pull`, seeding, and deployment-pipeline guidance. |
| [`zenstack-migrate-from-prisma`](skills/zenstack-migrate-from-prisma/SKILL.md) | Migrating an existing Prisma project to ZenStack V3: dependencies, schema conversion, client swap, scripts, custom generators, and client extensions. |
| [`zenstack-migrate-from-v2`](skills/zenstack-migrate-from-v2/SKILL.md) | Upgrading a ZenStack V2 project to V3: package renames, policy plugin, `post-update`/`before()`, types+mixins, server-adapter and TanStack Query hook changes. |
| [`zenstack-schema-modeling`](skills/zenstack-schema-modeling/SKILL.md) | Authoring `.zmodel` schemas: models, fields, relations, enums, custom types & mixins, polymorphism, typed JSON, and computed fields. |
| [`zenstack-access-control`](skills/zenstack-access-control/SKILL.md) | Access policies (`@@allow`/`@@deny`), the `auth()` function, field-level rules, post-update rules, and data validation. |
| [`zenstack-querying`](skills/zenstack-querying/SKILL.md) | Creating the `ZenStackClient`, the Prisma-compatible ORM API, relation queries, transactions, the Kysely query builder, and error handling. |
| [`zenstack-crud-server`](skills/zenstack-crud-server/SKILL.md) | Automatic CRUD web APIs ("Query as a Service"): RPC/REST handlers, server adapters (Express, Next.js, Fastify, Nuxt, SvelteKit, Hono, Elysia, TanStack Start), client SDKs (fetch-client, TanStack Query), and OpenAPI generation. |
| [`zenstack-plugin-dev`](skills/zenstack-plugin-dev/SKILL.md) | Developing plugins: custom ZModel attributes/functions, CLI code generators (`CliPlugin`), and runtime plugins (`$use`/`definePlugin` with `onQuery`/`onKyselyQuery`/`onEntityMutation`, client extension, computed fields). |

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
  zenstack-plugin-dev/SKILL.md
  zenstack-migrate-from-prisma/SKILL.md
  zenstack-migrate-from-v2/SKILL.md
  zenstack-db-migration/SKILL.md
```

Each skill is a directory containing a `SKILL.md` file with YAML frontmatter (`name`,
`description`) followed by the instructions an agent loads on demand. This is the structure the
[`skills` CLI](https://github.com/vercel-labs/skills) and [skills.sh](https://skills.sh) discover.

## References

The [`references/`](references) folder contains plain-markdown copies of the official ZenStack
documentation (`docs/docs` in the [`zenstack-docs`](https://github.com/zenstackhq/zenstack-docs)
submodule), with all Docusaurus/MDX scaffolding stripped. They're the source material the skills are
distilled from, kept in the repo so an agent can grep/read the full docs offline.

They're produced by [`scripts/generate-references.ts`](scripts/generate-references.ts):

```bash
# one-time: pull the docs + embedded code-repos submodules
git submodule update --init --recursive

# regenerate references/ from docs/docs
npm install
npm run generate:references   # or: npx tsx scripts/generate-references.ts
```

The generator only reads `docs/docs` (not `versioned_docs`, `blog`, etc.), mirrors the directory
structure into `references/`, converts MDX components and admonitions to plain markdown, inlines
imported markdown partials, and — for `<StackBlitzGithub>` embeds — inlines the referenced source
files from `docs/code-repos` as fenced code blocks.

## Contributing

To add a skill, create `skills/<skill-name>/SKILL.md` with `name` and `description` frontmatter and
add a row to the table above. Validate it locally before publishing:

```bash
npx skills add ./ --list
```

## License

[MIT](LICENSE)
