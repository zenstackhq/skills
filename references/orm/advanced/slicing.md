---
description: Creating an ORM client with a subset of capabilities.
---

# Slicing ORM API

> **Available since v3.4.0**

The ORM's slicing feature lets you create a restricted version of the ORM client that exposes only a subset of models, operations, and filter capabilities. This is useful for several scenarios:

1. You want to have a limited ORM API surface when using it in a limited domain area (e.g., in a micro service).
2. You want to avoid running expensive filter operations (e.g., due to db index settings).
3. You want to limit the capabilities exposed by the [automatic CRUD service](../../service/).

## Configuring Slicing

Slicing is configured through the `slicing` option, either when constructing the client or dynamically via `$setOptions`. The configuration supports three levels of restriction:

- **Model level**: include or exclude entire models.
- **Operation level**: include or exclude specific CRUD operations per model.
- **Field filter level**: include or exclude specific filter kinds per field.

At every level, exclusion takes precedence over inclusion. You typically configure slicing in one of the two ways:
1. Use only `excludeXXX` options to selectively exclude capabilities.
2. Use only `includeXXX` options to selectively include capabilities.

When configuring model-level and field-level slicing, you can use the special "$all" key to denote all models or all fields. If both "$all" and specific model/field settings exist, the specific settings override "$all" settings.

### Slicing Models

Use `excludedModels` to exclude entire models from the client. The resulting client will not expose the excluded models at all — both at the type level and at runtime.

```ts
const slicedDb = db.$setOptions({
  ...db.$options,
  slicing: {
    excludedModels: ['Comment'],
  },
});

// `slicedDb.comment` is no longer available
```

You can also use `includedModels` to allow only a specific set of models. If both are specified, `excludedModels` takes priority.

### Slicing Operations

Use `excludedOperations` within a model's slicing config to remove specific CRUD operations. This is useful for creating read-only views or preventing bulk mutations.

```ts
const slicedDb = db.$setOptions({
  ...db.$options,
  slicing: {
    models: {
      post: {
        excludedOperations: ['deleteMany'],
      },
    },
  },
});

// `slicedDb.post.deleteMany` is no longer available
```

To configure operation exclusion for all models, use the special "$all" key:

```ts
const slicedDb = db.$setOptions({
  ...db.$options,
  slicing: {
    models: {
      $all: {
        excludedOperations: ['deleteMany'],
      },
    },
  },
});
```

The `AllReadOperations` and `AllWriteOperations` constants exported from `@zenstackhq/orm` can be handy if you want to configure for such groups of operations.

You can also use `includedOperations` to allow only a specific set of operations.

### Slicing Filters

Use the `fields` config within a model (or "$all" for all models) to control which filter kinds are allowed for specific (or all) fields.

```ts
const slicedDb = db.$setOptions({
  ...db.$options,
  slicing: {
    models: {
      post: {
        fields: {
          title: {
            includedFilterKinds: ['Equality'],
          },
        },
      },
    },
  },
});

// Only equality filters (equals, not, in, notIn) work on `Post.title`.
// Other filters like `contains` will result in a validation error.
```

You can also use `excludeFilterKinds` to exclude specific filter capabilities.

The available filter kinds are:

| Kind | Covered Operators |
|------|-----------|
| `Equality` | `equals`, `not`, `in`, `notIn`, plus direct value filters, like `db.user.findMany({ where: { name: 'Joe' }}`) |
| `Range` | `lt`, `lte`, `gt`, `gte`, `between` |
| `Like` | `contains`, `startsWith`, `endsWith`, `mode` |
| `Relation` | `is`, `isNot`, `some`, `every`, `none` |
| `Json` | `path`, `string_contains`, `string_starts_with`, `string_ends_with`, `array_contains`, `array_starts_with`, `array_ends_with` |
| `List` | `has`, `hasEvery`, `hasSome`, `isEmpty` |

### Slicing Custom Procedures

If your schema defines custom procedures, you can also slice them using `includedProcedures` and `excludedProcedures` at the top level of the slicing config.

## Type Safety

Slicing is fully reflected in the TypeScript type system. When you exclude a model, its accessor is removed from the client type. When you exclude an operation, the corresponding method is removed from the model delegate type.

## Samples

**`slicing/slicing.ts`**

```typescript
import { createClient } from '../db';
import { createPosts } from '../utils';

// basic find demo
async function main() {
  const db = await createClient();

  // create a sliced ORM client with slicing options, you can also pass
  // the options directly when constructing a `ZenStackClient`
  const slicedDb = db.$setOptions({
    ...db.$options,
    slicing: {
      // exclude the Comment model entirely
      excludedModels: ['Comment'],
      models: {
        post: {
          // exclude `deleteMany` operation for 'Post' model
          excludedOperations: ['deleteMany'],
          fields: {
            title: {
              // only allow equality filter for "Post.title" field
              includedFilterKinds: ['Equality']
            }
          }
        }
      }
    }
  });

  // @ts-expect-error: Comment model is excluded
  console.log("Sliced client's Comment model:", slicedDb.comment);

  // @ts-expect-error: deleteMany is excluded for post model
  console.log("Sliced client's Post model deleteMany operation:", slicedDb.post.deleteMany);

  try {
    // @ts-expect-error: only equality filter is allowed for title field
    await slicedDb.post.findMany({ where: { title: { contains: 'test' } } });
  } catch (err: any) {
    console.log('Got an expected error:', err.message);
  }
}

main();
```
