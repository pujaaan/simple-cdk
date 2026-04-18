# Wire a DynamoDB table to a Lambda

This page is the complete recipe for defining a DynamoDB table in simple-cdk and giving a Lambda function access to it. Four files, no hidden IAM, no hidden env vars.

## The shape

```
my-app/
  simple-cdk.config.ts           # declares adapters and the wiring
  backend/
    models/
      todo.model.ts              # the DynamoDB table definition
    functions/
      create-todo/
        handler.ts               # the Lambda that writes to the table
      list-todos/
        handler.ts               # the Lambda that reads from the table
```

The DynamoDB adapter discovers every `*.model.ts` file under `backend/models/`. The Lambda adapter discovers every folder under `backend/functions/` that has a `handler.ts`. The wiring adapter cross-references them.

## 1. Define the DynamoDB table

Create the model file. The filename stem (`todo`) becomes the logical name used by `getDynamoTable(ctx, 'todo')`. The physical table name in AWS is `<app>-<stage>-<stem>`, e.g. `my-app-dev-todo`.

```ts
// backend/models/todo.model.ts
import type { DynamoDbModelConfig } from '@simple-cdk/dynamodb';

export default {
  pk: { name: 'id' },                     // partition key. Required.
  // sk: { name: 'createdAt' },           // optional sort key
  // gsis: [{ name: 'by-owner', pk: { name: 'ownerId' } }],
  // stream: 'NEW_AND_OLD_IMAGES',        // enable DynamoDB streams
  // ttlAttribute: 'expiresAt',           // enable TTL
  // billingMode: 'PAY_PER_REQUEST',      // default. Also: 'PROVISIONED'
  attributes: {                           // optional. Read only by `simple-cdk generate-schema`.
    title: { type: 'String', required: true },
    completed: { type: 'Boolean' },
    createdAt: { type: 'AWSDateTime' },
  },
} satisfies DynamoDbModelConfig;
```

That's the entire table definition. When the DynamoDB adapter runs, it creates a real `aws-cdk-lib/aws-dynamodb.Table` construct with sane defaults: `PAY_PER_REQUEST` billing, point-in-time recovery enabled, `removalPolicy` following the stage config.

## 2. Write the Lambda handlers

Each folder under `backend/functions/` with a `handler.ts` becomes a Lambda. Folder name (`create-todo`) becomes the logical Lambda name.

```ts
// backend/functions/create-todo/handler.ts
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';

const ddb = new DynamoDBClient({});
const TABLE = process.env.TABLE_NAME!;    // injected by the wiring adapter in step 3

export const handler = async (event: { id: string; title: string }) => {
  await ddb.send(new PutItemCommand({
    TableName: TABLE,
    Item: {
      id: { S: event.id },
      title: { S: event.title },
      completed: { BOOL: false },
      createdAt: { S: new Date().toISOString() },
    },
  }));
  return { ok: true };
};
```

```ts
// backend/functions/list-todos/handler.ts
import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';

const ddb = new DynamoDBClient({});
const TABLE = process.env.TABLE_NAME!;

export const handler = async () => {
  const res = await ddb.send(new ScanCommand({ TableName: TABLE }));
  return res.Items ?? [];
};
```

## 3. Declare adapters and wire them

The `dynamoDbAdapter` provisions the table. The `lambdaAdapter` provisions the functions. The wiring adapter at the bottom grants IAM and injects the table name.

```ts
// simple-cdk.config.ts
import { defineConfig } from '@simple-cdk/core';
import { lambdaAdapter, getLambdaFunction } from '@simple-cdk/lambda';
import { dynamoDbAdapter, getDynamoTable } from '@simple-cdk/dynamodb';

export default defineConfig({
  app: 'my-app',
  defaultStage: 'dev',
  stages: {
    dev:  { region: 'us-east-1', removalPolicy: 'destroy' },
    prod: { region: 'us-east-1', removalPolicy: 'retain' },
  },
  adapters: [
    dynamoDbAdapter(),                    // discovers backend/models/*.model.ts → creates real CDK tables
    lambdaAdapter(),                      // discovers backend/functions/* → creates real CDK lambdas
    {
      name: 'lambda-dynamodb',
      wire: (ctx) => {
        const table  = getDynamoTable(ctx, 'todo');        // real aws-cdk-lib Table
        const writer = getLambdaFunction(ctx, 'create-todo');
        const reader = getLambdaFunction(ctx, 'list-todos');

        // IAM: use the narrowest grant that works
        table.grantWriteData(writer);     // PutItem, UpdateItem, DeleteItem, BatchWriteItem
        table.grantReadData(reader);      // GetItem, Query, Scan, BatchGetItem

        // env var: pipe the actual table name through so renames don't drift
        writer.addEnvironment('TABLE_NAME', table.tableName);
        reader.addEnvironment('TABLE_NAME', table.tableName);
      },
    },
  ],
});
```

## 4. Deploy

```bash
npx simple-cdk list --stage dev          # confirms adapter discovery found your model + handlers
npx simple-cdk deploy --stage dev        # creates the table, the lambdas, and the IAM grants
```

That's the whole flow. The table exists in AWS as `my-app-dev-todo`. Both Lambdas have IAM permissions for the actions they use and nothing else.

## Grant variants

Pick the narrowest one that covers what the handler actually calls:

| Grant | AWS actions |
|---|---|
| `table.grantReadData(fn)` | `GetItem`, `BatchGetItem`, `Query`, `Scan`, `ConditionCheckItem`, `DescribeTable` |
| `table.grantWriteData(fn)` | `PutItem`, `UpdateItem`, `DeleteItem`, `BatchWriteItem`, `DescribeTable` |
| `table.grantReadWriteData(fn)` | union of the two above |
| `table.grantFullAccess(fn)` | adds admin actions. Avoid in application code. |
| `table.grantStreamRead(fn)` | for stream consumers. Paired with `streamTargets` on the model |

## Why grants aren't automatic

simple-cdk doesn't auto-grant every Lambda access to every table because least-privilege stays visible. If a Lambda needs a table, that relationship shows up in one place (the wiring adapter) instead of being implied by file layout. This also means a Lambda that doesn't need a table doesn't pay for a useless IAM policy.

## Multiple lambdas, one table

```ts
wire: (ctx) => {
  const table = getDynamoTable(ctx, 'todo');
  for (const name of ['create-todo', 'update-todo', 'delete-todo']) {
    const fn = getLambdaFunction(ctx, name);
    table.grantWriteData(fn);
    fn.addEnvironment('TABLE_NAME', table.tableName);
  }
  for (const name of ['get-todo', 'list-todos']) {
    const fn = getLambdaFunction(ctx, name);
    table.grantReadData(fn);
    fn.addEnvironment('TABLE_NAME', table.tableName);
  }
}
```

## One lambda, many tables

```ts
wire: (ctx) => {
  const fn = getLambdaFunction(ctx, 'reporter');
  for (const model of ['todo', 'user', 'organization']) {
    const table = getDynamoTable(ctx, model);
    table.grantReadData(fn);
    fn.addEnvironment(`${model.toUpperCase()}_TABLE`, table.tableName);
  }
}
```

## Stream consumers

If the Lambda is consuming a DynamoDB stream instead of making API calls, declare it on the model and skip the wiring adapter:

```ts
// backend/models/todo.model.ts
export default {
  pk: { name: 'id' },
  streamTargets: ['on-todo-change'],      // the adapter attaches a DynamoEventSource
} satisfies DynamoDbModelConfig;
```

The lambda adapter must have discovered a function named `on-todo-change`. `streamTargets` implies `stream: 'NEW_AND_OLD_IMAGES'` unless you set `stream` explicitly.

## Related

- [Home](./Home.md#simple-cdkdynamodb) for the full DynamoDB model options (`sk`, `gsis`, `ttlAttribute`, etc.)
- [Home](./Home.md#simple-cdklambda) for per-function config (memory, timeout, runtime)
- [Extending](./Extending.md) for writing a custom adapter that bundles the wiring
