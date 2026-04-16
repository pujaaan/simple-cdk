# simple-cdk

Build on AWS without being an AWS expert.

A thin, plugin-driven layer on top of [AWS CDK](https://aws.amazon.com/cdk/). The engine itself is tiny and stable. Real opinions live in **adapters** — swap them, extend them, or write your own.

## Why

| What you want | What's painful today |
|---------------|----------------------|
| Spin up an API + DB + auth quickly | Raw CDK is verbose; every project hand-rolls the same wiring |
| Keep full control over AWS | Amplify hides too much and is hard to escape when you outgrow it |
| Reduce boilerplate without giving up CDK | SST removes IaC boilerplate but you still wire every model and resolver yourself |

simple-cdk is the **kernel + plugins** version: a stable engine with a small adapter contract, plus opinionated defaults for the common AWS resources. Drop down to raw CDK any time; replace any adapter with your own.

## Quick start

```bash
git clone <this repo>
cd "AWS CDK"
npm install
npm run build
cd examples/01-minimal
npm run list      # see what each adapter discovered
npm run synth     # generate CloudFormation
npm run deploy    # push to AWS
```

You'll need:

- Node 22+
- AWS credentials configured (`AWS_PROFILE` or `~/.aws/credentials`)
- A bootstrapped CDK environment (`npx cdk bootstrap`)

## What's in the box

| Package | What it does |
|---------|--------------|
| [`@simple-cdk/core`](./packages/core) | Engine: adapter loader, lifecycle, config, types |
| [`@simple-cdk/cli`](./packages/cli) | The `simple-cdk` CLI binary |
| [`@simple-cdk/lambda`](./packages/adapter-lambda) | Auto-discover Lambda handlers from `backend/functions/` |
| [`@simple-cdk/dynamodb`](./packages/adapter-dynamodb) | Model-driven DynamoDB tables from `backend/models/` |
| [`@simple-cdk/appsync`](./packages/adapter-appsync) | AppSync GraphQL API + auto CRUD resolvers + pluggable auth |
| [`@simple-cdk/cognito`](./packages/adapter-cognito) | Cognito user pool + Lambda triggers from `backend/triggers/` |

## A real config

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

That's a complete app. No stacks, no constructs, no IAM dance.

## Examples

| Example | Shows |
|---------|-------|
| [01-minimal](./examples/01-minimal) | One Lambda + AppSync field, no database |
| [02-with-models](./examples/02-with-models) | DynamoDB + auto-CRUD, no resolver code |

## Customizing

simple-cdk is plugin-driven by design. The engine knows nothing about specific AWS services — adapters do.

- [Getting started](./docs/getting-started.md) — install, configure, deploy
- [Architecture](./docs/architecture.md) — engine, adapters, lifecycle
- [Extending](./docs/extending.md) — write your own adapter, override a default, plug in custom auth

## Status

Pre-1.0. APIs may change. Issues and PRs welcome.

## License

MIT
