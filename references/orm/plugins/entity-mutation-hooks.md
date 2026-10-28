# Entity Mutation Hooks

> **Preview Feature**

Plugin feature is in preview and may be subject to breaking changes in future releases.

## Introduction

Entity mutation hooks allow you to intercept entity mutation operations, i.e., "create", "update", and "delete". They are triggered regardless of whether the operations are performed through the ORM queries or the query builder API.

To create an entity mutation hook plugin, call the `$use` method with an `onEntityMutation` key. Hooks can be registered for all models under the `$all` key, or for individual models under their model names:

```ts
const db = client.$use({
    id: 'audit',
    onEntityMutation: {
        // called for mutations of every model
        $all: {
            afterEntityMutation({ model, action }) {
                console.log('Mutated:', model, action);
            },
        },

        // called for mutations of `Post` only
        Post: {
            async afterEntityMutation({ action, loadAfterMutationEntities }) {
                // entities are typed as `Post` rows
                const posts = await loadAfterMutationEntities();
                console.log('Post mutated:', action, posts);
            },
        },
    },
});
```

> **Available since v3.10.0**

Both `$all` and per-model hooks can be registered in the same plugin. For a mutation, the `$all` hook runs first, followed by the model's hook.

> **Warning**

Before v3.10.0, catch-all hooks were defined directly under `onEntityMutation`. That shape no longer type-checks, so TypeScript reports an error until you move the hooks under `$all`. At runtime it's still supported for now, with a deprecation warning. If both shapes are present, the `$all` hooks are used.

Each hook definition (`$all` or per-model) is an object with the following fields (all optional):

- `beforeEntityMutation`
    A callback function that is called before the entity mutation operation. It receives a context object containing:
      - The model.
      - The action (`create`, `update`, `delete`).
      - The Kysely query node (SQL AST).
      - An async loader to load the entities to be mutated.
      - An `ZenStackClient` instance to perform further queries or mutations. Mutation operations initiated with this client will not trigger the entity mutation hooks again.
      - A unique query ID to correlate data between `beforeEntityMutation` and `afterEntityMutation` hooks.

- `afterEntityMutation`
    A callback function that is called after the entity mutation operation. It receives a context object containing:
      - The model.
      - The action (`create`, `update`, `delete`).
      - The Kysely query node (SQL AST).
      - An async loader to load the entities after the mutation.
      - An `ZenStackClient` instance to perform further queries or mutations. Mutation operations initiated with this client will not trigger the entity mutation hooks again.
      - A unique query ID to correlate data between `beforeEntityMutation` and `afterEntityMutation` hooks.

- `runAfterMutationWithinTransaction`

    A boolean option that controls whether to run after-mutation hooks within the transaction that performs the mutation. It can be set separately for `$all` and for each model.
    - If set to `true`, if the mutation already runs inside a transaction, the callbacks are executed immediately after the mutation within the transaction boundary. If the mutation is not running inside a transaction, a new transaction is created to wrap both the mutation and the callbacks. If your hooks make further mutations, they will succeed or fail atomically with the original mutation.
    - If set to `false`, the callbacks are executed after the mutation transaction is committed.

    Defaults to `false`.

## Loaded entities

Entities returned by the loaders are read directly from the model's database table, the same way as [query builder](../query-builder.md) results. This means:

- They only contain the table's own columns. Relations, computed fields, and fields inherited from a polymorphic base model are not included.
- Values are in the form returned by the database driver, not converted by the ORM. For example, depending on the database, a `DateTime` field may be a string, and a `Boolean` field may be `1` or `0`.

For per-model hooks, the entities are typed accordingly with the `MutationHookEntity<Schema, Model>` type exported from `@zenstackhq/orm`.

## Polymorphic models

For [polymorphic models](../polymorphism.md), a mutation fires one event for each table it writes, keyed by that table's model:

- Creating a concrete model entity fires an event for the base model, followed by one for the concrete model.
- Updating fields fires an event for each table that has updated fields: the base model for inherited fields, and the concrete model for its own fields.
- Deleting a concrete model entity fires an event for the base model only (the concrete model's row is removed by the database's cascade delete).

Base model entities contain the discriminator field, which you can use to tell which concrete model an entity belongs to. Since a concrete model's mutations are split across tables, neither the base model's hooks nor the concrete model's hooks see all of them. To observe every mutation of a concrete model, register hooks on both models (or use `$all`).

> **Info**

Update and delete triggered by cascading operations are not captured by the entity mutation hooks.

> **Warning**

Be very careful about loading before and after mutation entities. Batch mutations can result in a large number of entities being loaded and incur significant performance overhead.

## Samples

**`plugins/entity-mutation-hooks.ts`**

```typescript
import { definePlugin } from '@zenstackhq/orm';
import { createClient } from '../db';
import { schema } from '../zenstack/schema';
import { createUsersAndPosts } from '../utils';

async function main() {
  const db = await createClient();

  // intercept all mutations, without loading entities
  const db1 = db.$use(
    definePlugin({
      id: 'plugin1',
      onEntityMutation: {
        $all: {
          beforeEntityMutation: ({ model, action }) => {
            console.log('[plugin1] Before mutation:', model, action);
          },

          afterEntityMutation: ({ model, action }) => {
            console.log('[plugin1] After mutation:', model, action);
          }
        }
      }
    })
  );

  await createUsersAndPosts(db1);

  // only intercept Post's update mutation, loading before and after entities
  // (passing the schema to `definePlugin` makes the loaded entities typed)
  const plugin2 = definePlugin(schema, {
    id: 'plugin2',
    onEntityMutation: {
      Post: {
        async beforeEntityMutation({ action, loadBeforeMutationEntities }) {
          if (action === 'update') {
            // entities are typed as `Post` rows
            const entities = await loadBeforeMutationEntities();
            console.log('[plugin2] Before mutation:', action, entities);
          }
        },

        async afterEntityMutation({ action, loadAfterMutationEntities }) {
          if (action === 'update') {
            const entities = await loadAfterMutationEntities();
            console.log('[plugin2] After mutation:', action, entities);
          }
        }
      }
    }
  });
  const db2 = db.$use(plugin2);

  const post = await db2.post.create({ data: { title: 'New Post' } });
  await db2.post.update({ where: { id: post.id }, data: { viewCount: 1 } });
}

main();
```
