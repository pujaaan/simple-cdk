# simple-cdk Wiki

> Build on AWS without being an AWS expert.

A thin, plugin-driven layer on top of [AWS CDK](https://aws.amazon.com/cdk/). The engine is tiny and stable. Real opinions live in **adapters** — swap them, extend them, or write your own.

---

## Start here

| | |
|---|---|
| **New?** | Read [[Getting-Started]] |
| **Want the big picture?** | Read [[Architecture]] |
| **Ready to customize?** | Read [[Extending]] or jump to [[Build-Custom-Adapter]] |
| **Looking for an adapter?** | Browse [[Adapters]] |

---

## What's in the box

| Package | What it does |
|---------|--------------|
| `@simple-cdk/core` | Engine: adapter loader, lifecycle, config, types |
| `@simple-cdk/cli` | The `simple-cdk` CLI binary |
| `@simple-cdk/lambda` | Auto-discover Lambda handlers from `backend/functions/` |
| `@simple-cdk/dynamodb` | Model-driven DynamoDB tables from `backend/models/` |
| `@simple-cdk/appsync` | AppSync GraphQL API + auto CRUD + pluggable auth |
| `@simple-cdk/cognito` | Cognito user pool + Lambda triggers from `backend/triggers/` |

See per-adapter pages in [[Adapters]] for full options.

---

## Why simple-cdk

| What you want | What's painful today |
|---------------|----------------------|
| Spin up an API + DB + auth quickly | Raw CDK is verbose; every project hand-rolls the same wiring |
| Keep full control over AWS | Amplify hides too much and is hard to escape when you outgrow it |
| Reduce boilerplate without giving up CDK | SST removes IaC boilerplate but you still wire every model and resolver yourself |

simple-cdk is the **kernel + plugins** version. Stable engine + opinionated defaults for common AWS resources. Drop down to raw CDK any time. Replace any adapter with your own.

---

## A complete app, in one file

```ts
// simple-cdk.config.ts
import { defineConfig } from '@simple-cdk/core';
import { lambdaAdapter } from '@simple-cdk/lambda';
import { dynamoDbAdapter } from '@simple-cdk/dynamodb';
import { appSyncAdapter } from '@simple-cdk/appsync';

export default defineConfig({
  app: 'my-app',
  defaultStage: 'dev',
  stages: {
    dev:  { region: 'us-east-1', removalPolicy: 'destroy' },
    prod: { region: 'us-east-1', removalPolicy: 'retain', logRetentionDays: 365 },
  },
  adapters: [
    lambdaAdapter({ dir: 'backend/functions' }),
    dynamoDbAdapter({ dir: 'backend/models' }),
    appSyncAdapter({
      schemaFile: 'schema.graphql',
      generateCrud: { models: 'all' },
    }),
  ],
});
```

That's a working backend. No stacks, no constructs, no IAM dance.

---

## Status

Pre-1.0. APIs may change.
