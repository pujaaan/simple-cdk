# Custom AppSync resolvers

Auto-CRUD covers `get<Model>`, `list<Model>s`, `create<Model>`, `update<Model>`, `delete<Model>` for every DynamoDB model. When you need logic beyond that (a query with custom indexes, a mutation that validates and transforms input, a resolver that calls a Lambda), register a manual resolver and point it at either a JS file or a Lambda function.

## Two resolver sources

The `source` field in a resolver spec has two shapes:

```ts
// packages/adapter-appsync/src/types.ts
type ResolverSource =
  | { kind: 'lambda'; lambdaName: string }
  | { kind: 'dynamodb'; tableName: string; jsFile: string };
```

- `lambda`: the resolver invokes a Lambda function. No JS file needed; the Lambda receives `event.arguments`, `event.identity`, `event.source` and returns the result directly.
- `dynamodb`: the resolver talks to DynamoDB via an [AppSync JS function](https://docs.aws.amazon.com/appsync/latest/devguide/resolver-reference-overview-js.html). You write a JS file that exports `request(ctx)` and `response(ctx)`; AppSync runs it in its sandboxed JS runtime.

Pick the JS path when the logic fits DynamoDB's API and doesn't need external I/O (cheaper, lower latency, no cold start). Pick Lambda when you need to call another service, run complex validation, or share code with existing Lambda handlers.

## Lambda-backed resolver

### simple-cdk.config.ts

```ts
import { defineConfig } from '@simple-cdk/core';
import { lambdaAdapter } from '@simple-cdk/lambda';
import { dynamoDbAdapter, getDynamoTable } from '@simple-cdk/dynamodb';
import { appSyncAdapter } from '@simple-cdk/appsync';
import { getLambdaFunction } from '@simple-cdk/lambda';

export default defineConfig({
  app: 'my-app',
  stages: { dev: { region: 'us-east-1', removalPolicy: 'destroy' } },
  adapters: [
    dynamoDbAdapter(),
    lambdaAdapter(),
    appSyncAdapter({
      schemaFile: 'schema.graphql',
      generateCrud: { models: 'all' },
      resolvers: [
        {
          typeName: 'Mutation',
          fieldName: 'completeTodo',
          source: { kind: 'lambda', lambdaName: 'complete-todo' },
        },
      ],
    }),
    // grant the resolver's lambda access to the table
    {
      name: 'complete-todo-bindings',
      wire: (ctx) => {
        const fn = getLambdaFunction(ctx, 'complete-todo');
        const table = getDynamoTable(ctx, 'todo');
        table.grantReadWriteData(fn);
        fn.addEnvironment('TABLE_NAME', table.tableName);
      },
    },
  ],
});
```

### schema.graphql

```graphql
type Mutation {
  completeTodo(id: ID!, completedBy: ID!): Todo!
}
```

### backend/functions/complete-todo/handler.ts

This is a regular Lambda handler. AppSync invokes it with an event shaped as `{ arguments, identity, source, info, prev }`. Return the result or throw to propagate an error back as a GraphQL error.

```ts
import {
  DynamoDBClient,
  UpdateItemCommand,
  ConditionalCheckFailedException,
} from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';

const ddb = new DynamoDBClient({});
const TABLE = process.env.TABLE_NAME!;

type Args = { id: string; completedBy: string };
type Identity = { sub: string; claims?: Record<string, unknown> };

export const handler = async (event: { arguments: Args; identity: Identity }) => {
  const { id, completedBy } = event.arguments;

  if (!event.identity?.sub) {
    throw new Error('Unauthorized');             // becomes a GraphQL error
  }

  try {
    const res = await ddb.send(new UpdateItemCommand({
      TableName: TABLE,
      Key: { id: { S: id } },
      ConditionExpression: 'attribute_exists(id) AND completed = :false',
      UpdateExpression: 'SET completed = :true, completedBy = :by, completedAt = :now',
      ExpressionAttributeValues: {
        ':false': { BOOL: false },
        ':true':  { BOOL: true },
        ':by':    { S: completedBy },
        ':now':   { S: new Date().toISOString() },
      },
      ReturnValues: 'ALL_NEW',
    }));
    return unmarshall(res.Attributes!);
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) {
      throw new Error('Todo not found or already completed');
    }
    throw err;
  }
};
```

Thrown errors surface in the GraphQL response as `errors[].message`. The auth pipeline (if configured) still runs first and can short-circuit via `util.unauthorized()`.

## DynamoDB-backed JS resolver

### simple-cdk.config.ts

```ts
appSyncAdapter({
  schemaFile: 'schema.graphql',
  resolvers: [
    {
      typeName: 'Query',
      fieldName: 'listTodosByOwner',
      source: {
        kind: 'dynamodb',
        tableName: 'todo',
        jsFile: 'resolvers/list-todos-by-owner.js',
      },
    },
  ],
}),
```

The adapter auto-grants the resolver the narrowest access it needs based on the DynamoDB operation, and auto-wires the table as the data source.

### schema.graphql

Assumes a GSI named `by-owner` declared on the model (`gsis: [{ name: 'by-owner', pk: { name: 'ownerId' } }]`).

```graphql
type Query {
  listTodosByOwner(ownerId: ID!, limit: Int, nextToken: String): TodoConnection!
}

type TodoConnection {
  items: [Todo!]!
  nextToken: String
}
```

### resolvers/list-todos-by-owner.js

This is the full JS file content. AppSync runs it in its sandboxed JS runtime; `@aws-appsync/utils` is available as `util`. The file must export a `request(ctx)` function (returns the DynamoDB operation) and a `response(ctx)` function (shapes the GraphQL response).

```js
import { util } from '@aws-appsync/utils';

export function request(ctx) {
  const { ownerId, limit, nextToken } = ctx.args;

  // input validation: surface errors before hitting DynamoDB
  if (!ownerId) {
    util.error('ownerId is required', 'ValidationError');
  }

  return {
    operation: 'Query',
    index: 'by-owner',
    query: {
      expression: 'ownerId = :ownerId',
      expressionValues: util.dynamodb.toMapValues({ ':ownerId': ownerId }),
    },
    limit: limit ?? 20,
    nextToken: nextToken ?? undefined,
  };
}

export function response(ctx) {
  // always check ctx.error; DynamoDB errors don't throw, they populate ctx.error
  if (ctx.error) {
    util.error(ctx.error.message, ctx.error.type);
  }

  return {
    items: ctx.result.items ?? [],
    nextToken: ctx.result.nextToken ?? null,
  };
}
```

### A second example: filtered list with a PutItem

`resolvers/create-todo-if-new.js` shows the PutItem shape with a conditional expression:

```js
import { util } from '@aws-appsync/utils';

export function request(ctx) {
  const { id, title, ownerId } = ctx.args.input;

  if (!title || title.length > 500) {
    util.error('title is required and must be <= 500 chars', 'ValidationError');
  }

  return {
    operation: 'PutItem',
    key: util.dynamodb.toMapValues({ id }),
    attributeValues: util.dynamodb.toMapValues({
      title,
      ownerId,
      completed: false,
      createdAt: util.time.nowISO8601(),
    }),
    condition: {
      expression: 'attribute_not_exists(id)',
    },
  };
}

export function response(ctx) {
  if (ctx.error) {
    // ConditionalCheckFailed means a row with this id already exists
    if (ctx.error.type === 'DynamoDB:ConditionalCheckFailedException') {
      util.error('Todo with this id already exists', 'Conflict');
    }
    util.error(ctx.error.message, ctx.error.type);
  }
  return ctx.result;
}
```

## Error handling

The JS resolver runtime gives you three error functions on `util`:

| Function | When to use |
|---|---|
| `util.error(message, type?, data?, errorInfo?)` | Fail the field. Throws; nothing after it runs. The GraphQL response gets an entry in `errors[]`. |
| `util.appendError(message, type?)` | Record a non-fatal error and keep going. The field still returns a value; the error appears alongside it in the response. |
| `util.unauthorized()` | Shorthand for unauthorized. Usually called from the auth pipeline, but legal inside a resolver. |

For Lambda resolvers, any thrown `Error` propagates as a GraphQL error. Use a typed error class if you want the resolver to surface different error categories:

```ts
class ValidationError extends Error { constructor(msg: string) { super(msg); this.name = 'ValidationError'; } }
class ConflictError extends Error { constructor(msg: string) { super(msg); this.name = 'ConflictError'; } }

// AppSync surfaces `errorType: 'ValidationError'` / `'ConflictError'` in the response
```

## Pre-resolver stash: `stashBefore` and `stashCode`

When a resolver needs values computed from `ctx.identity` or `ctx.args` before the main request function runs (tenant IDs, derived keys), use `stashBefore` for simple key/value seeding or `stashCode` for multi-statement logic.

```ts
resolvers: [
  {
    typeName: 'Query',
    fieldName: 'myTodos',
    source: { kind: 'dynamodb', tableName: 'todo', jsFile: 'resolvers/my-todos.js' },
    stashBefore: {
      userId:    { code: 'ctx.identity.sub' },                 // emitted verbatim
      tenantId:  { code: "ctx.identity.claims?.['custom:tenantId']" },
      scanLimit: 50,                                           // literal, JSON-encoded
    },
  },
  {
    typeName: 'Mutation',
    fieldName: 'publishPost',
    source: { kind: 'lambda', lambdaName: 'publish-post' },
    stashCode: `
      const claims = ctx.identity?.claims ?? {};
      ctx.stash.userId = claims.sub;
      ctx.stash.roles = (claims['custom:roles'] ?? '').split(',').filter(Boolean);
      if (!ctx.stash.roles.includes('author')) util.unauthorized();
    `,
  },
],
```

Inside the JS file, the values are available as `ctx.stash.userId`, `ctx.stash.tenantId`, etc.

## Bypassing the auth pipeline

Resolvers opt out of the global auth pipeline with `bypassAuth: true`. Use sparingly; it's meant for things like public health-check queries:

```ts
{
  typeName: 'Query',
  fieldName: 'healthCheck',
  source: { kind: 'lambda', lambdaName: 'health' },
  bypassAuth: true,
},
```

## Testing custom resolvers

Three approaches, in order of fidelity:

1. **AppSync `EvaluateCode` API.** AWS provides an API (`aws appsync evaluate-code`) that runs a resolver JS file against a mocked `ctx` and returns the emitted DynamoDB request or response. Use this in CI to catch shape errors before deploy:

   ```bash
   aws appsync evaluate-code \
     --runtime name=APPSYNC_JS,runtimeVersion=1.0.0 \
     --code file://resolvers/list-todos-by-owner.js \
     --function request \
     --context '{"args":{"ownerId":"u_1","limit":10}}'
   ```

   Script this per resolver for a fast, offline-ish test suite.

2. **Unit test the Lambda handler directly.** Lambda-backed resolvers are just Lambdas, so test them the way you test any Lambda: invoke the exported `handler` with a mocked event and assert on the return value. Use `aws-sdk-client-mock` to stub the DynamoDB client.

3. **Integration test against a deployed stage.** Deploy to a `test` stage, fire GraphQL queries with `fetch` or `graphql-request`, assert on the JSON response. Slowest but the only one that catches schema/resolver mismatches.

The AppSync JS runtime is restrictive (no `fetch`, no `Date`, no async). `util.time.nowISO8601()` replaces `new Date().toISOString()`; `util.dynamodb.toMapValues()` replaces manual marshalling. Keep that in mind when porting logic from Lambda to JS resolvers.

## Related

- [Home](./Home.md#simple-cdkappsync) for the `appSyncAdapter` option reference
- [Extending](./Extending.md#pluggable-auth-pipeline-appsync) for the auth pipeline shape
- [AWS AppSync JS resolver reference](https://docs.aws.amazon.com/appsync/latest/devguide/resolver-reference-overview-js.html) for the full `util` API and DynamoDB operation shapes
