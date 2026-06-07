---
description: Zod schema generation from ZModel
---

# Zod

> **Available since v3.4.0**

The `@zenstackhq/zod` package generates [Zod](https://zod.dev/) validation schemas from your ZModel definitions. It provides type-safe schemas for models, embedded types, and enums, with full support for validation attributes and custom validation rules.

## Installation

```bash
npm install @zenstackhq/zod zod
```

Zod 4.0 or above is required.

## API

The package exports a `createSchemaFactory` function that takes a ZenStack schema as input and returns a factory for creating Zod schemas.

```ts
import schema from './zenstack/schema';
import { createSchemaFactory } from '@zenstackhq/zod';

const factory = createSchemaFactory(schema);
```

The factory exposes the following methods:

- `makeModelSchema`

    Creates a schema for a model. By default, **only scalar fields are included** — relation fields are excluded. Use `include` or `select` options to opt in to relations, mirroring ORM query API semantics.

    > **Available since v3.5.0**

    You can pass an optional second argument with `select`, `include`, `omit`, or `optionality` options:

    - **`select`** — pick only the listed fields. Set a field to `true` to include it with its default shape, or pass a nested options object for relation fields. Mutually exclusive with `include` and `omit`.
    - **`include`** — start with all scalar fields, then additionally include the named relation fields. Can be combined with `omit`.
    - **`omit`** — remove named scalar fields from the default set. Can be combined with `include`, but mutually exclusive with `select`.
    - **`optionality`** — controls which fields are made optional at runtime:
        - `'all'` — every field in the schema becomes optional.
        - `'defaults'` — only fields that have a `@default` attribute or are `@updatedAt` become optional; all other fields remain their original optionality.

    ```ts
    // Default: scalar fields only (no relations)
    const schema = factory.makeModelSchema('User');

    // Include a relation on top of all scalar fields
    const schema = factory.makeModelSchema('User', {
        include: { posts: true },
    });

    // Select specific fields only
    const schema = factory.makeModelSchema('User', {
        select: { id: true, email: true },
    });

    // Include a relation with nested selection
    const schema = factory.makeModelSchema('User', {
        select: {
            id: true,
            email: true,
            posts: {
                select: { id: true, title: true },
            },
        },
    });

    // Omit specific scalar fields
    const schema = factory.makeModelSchema('User', {
        omit: { password: true },
    });

    // Combine include and omit
    const schema = factory.makeModelSchema('User', {
        include: { posts: true },
        omit: { password: true },
    });

    // Make all fields optional (useful for update payloads)
    const schema = factory.makeModelSchema('User', {
        optionality: 'all',
    });

    // Make only @default / @updatedAt fields optional (useful for create payloads)
    const schema = factory.makeModelSchema('User', {
        optionality: 'defaults',
    });
    ```

    The resulting Zod schema is fully typed — the inferred TypeScript type reflects exactly which fields are present and their optionality based on the options you provide.

- `makeModelCreateSchema` *(deprecated)*

    > **Deprecated**

    Use `makeModelSchema(model, { optionality: 'defaults' })` instead.

    Creates a schema for creating new records, with fields that have defaults being optional. The result schema excludes relation fields.

- `makeModelUpdateSchema` *(deprecated)*

    > **Deprecated**

    Use `makeModelSchema(model, { optionality: 'all' })` instead.

    Creates a schema for updating records, with all fields being optional. The result schema excludes relation fields.

- `makeTypeSchema`

    Creates a schema for a [Custom Type](../modeling/typed-json).

- `makeEnumSchema`

    Creates a schema for an enum type.

## Schema Features

The created Zod schemas have the following features:

1. They are strongly typed.
1. They verify the basic shapes of input args (object fields and types).
1. They respect the additional validation attributes like `@email`, `@length`, etc., as described in [Input Validation](../orm/validation.md).
1. If a ZModel declaration has a `@@meta` or `@meta` attribute with "description" key, the meta value will be used as the Zod schema's metadata.

## Samples

**`zenstack/schema.zmodel`**

```zmodel
// This is a sample model to get you started.

datasource db {
    provider = 'sqlite'
}

/// User role
enum Role {
    USER
    ADMIN
}

/// Profile type definition
type Profile {
    bio     String?
    website String? @url
}

/// User model
model User {
    id      Int      @id @default(autoincrement())
    email   String   @unique @email @meta('description', 'The unique email address of the user')
    role    Role     @default(USER)
    profile Profile? @json
    posts   Post[]
    @@meta('description', 'A registered user of the application')
}

/// Post model
model Post {
    id       Int    @id @default(autoincrement())
    title    String
    author   User?  @relation(fields: [authorId], references: [id])
    authorId Int?
}
```

**`main.ts`**

```typescript
import { createSchemaFactory } from '@zenstackhq/zod';
import { schema } from './zenstack/schema';

const factory = createSchemaFactory(schema);

// enum
const roleSchema = factory.makeEnumSchema('Role');
console.log('"STAFF" is a valid Role?', roleSchema.safeParse('STAFF').success);

// type
const profileSchema = factory.makeTypeSchema('Profile');
console.log(
    'Profile allows invalid website?',
    profileSchema.safeParse({ website: 'not-a-url' }).success,
);

// User model's create schema
const userCreateSchema = factory.makeModelSchema('User',
    { optionality: 'defaults' }
);
console.log(
    'User create schema allows omitting "role"?',
    userCreateSchema.safeParse({ email: 'alice@example.com' }).success,
);

// User model full schema
const userSchema = factory.makeModelSchema('User',
    { include: { posts: true } }
);
console.log(
    'User full model allows relations?',
    userSchema.safeParse({
        id: 1,
        email: 'user@example.com',
        role: 'ADMIN',
        profile: { bio: 'A developer', website: 'https://example.com' },
        posts: [{ id: 1, title: 'Post1' }],
    }).success,
);

// `@@meta` and `@meta` handling
console.log(
    'User schema has description meta:',
    userSchema.meta()?.description,
);
console.log(
    'User.email field has description:',
    userCreateSchema.shape.email.meta()?.description,
);
```
