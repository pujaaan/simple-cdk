# @simple-cdk/appsync

[simple-cdk](https://github.com/pujaaan/simple-cdk) adapter that creates an AppSync GraphQL API, attaches Lambda + DynamoDB data sources, and (optionally) auto-generates CRUD resolvers from your DynamoDB models.

## Install

```bash
npm install @simple-cdk/appsync @simple-cdk/core @simple-cdk/dynamodb @simple-cdk/lambda aws-cdk-lib constructs
```

## Usage

```ts
import { defineConfig } from '@simple-cdk/core';
import { lambdaAdapter } from '@simple-cdk/lambda';
import { dynamoDbAdapter } from '@simple-cdk/dynamodb';
import { appSyncAdapter } from '@simple-cdk/appsync';

export default defineConfig({
  app: 'my-app',
  stages: { dev: { region: 'us-east-1' } },
  adapters: [
    lambdaAdapter(),
    dynamoDbAdapter(),
    appSyncAdapter({
      schemaFile: 'schema.graphql',
      generateCrud: { models: 'all', softDelete: false },
      resolvers: [
        {
          typeName: 'Mutation',
          fieldName: 'archiveOrder',
          source: { kind: 'lambda', lambdaName: 'archive-order' },
        },
      ],
    }),
  ],
});
```

## Auto-generated CRUD

For each DynamoDB model, the adapter generates five resolvers:

- `Query.get<Model>(id)` → GetItem
- `Query.list<Model>s(limit, nextToken)` → Scan
- `Mutation.create<Model>(input)` → PutItem
- `Mutation.update<Model>(input)` → UpdateItem
- `Mutation.delete<Model>(id)` → DeleteItem (or soft-delete)

Your schema must declare the matching field names. Example: model named `todo` → `getTodo`, `listTodos`, `createTodo`, `updateTodo`, `deleteTodo`.

## Pluggable auth pipeline

Provide an AppSync JS function that runs before every resolver:

```ts
appSyncAdapter({
  schemaFile: 'schema.graphql',
  authPipeline: { jsFile: 'resolvers/auth-pipeline.js' },
});
```

Skip it per-resolver with `bypassAuth: true`.

## When auto-CRUD isn't enough

Drop down to a manual resolver. Point at a JS file with your own request/response code:

```ts
resolvers: [
  {
    typeName: 'Query',
    fieldName: 'searchTodos',
    source: { kind: 'dynamodb', tableName: 'todo', jsFile: 'resolvers/search-todos.js' },
  },
];
```

Full docs at the [main repo](https://github.com/pujaaan/simple-cdk).
