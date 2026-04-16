# Getting Started

A first deploy from zero in about five minutes.

## Prerequisites

- **Node 22+** (we use native TypeScript stripping)
- **AWS credentials**: `aws configure`, `AWS_PROFILE`, or `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY`
- **A bootstrapped CDK environment** in your target region:
  ```bash
  npx cdk bootstrap aws://<account>/<region>
  ```

## Install

You have two options.

### Option A: install from npm (recommended)

```bash
mkdir my-app && cd my-app
npm init -y
npm pkg set type=module

npm install aws-cdk-lib constructs aws-cdk
npm install @simple-cdk/core @simple-cdk/cli
npm install @simple-cdk/lambda @simple-cdk/appsync
```

Install only the adapters you need. There's nothing magic about `lambda` or `appsync` here, they're separate packages.

### Option B: clone the repo

Use this when you want to hack on simple-cdk itself, run the bundled examples, or pin to a specific commit.

```bash
git clone https://github.com/pujaaan/simple-cdk.git
cd simple-cdk
npm install
npm run build
cd examples/01-minimal
npm run list
npm run deploy
```

The repo is an npm workspace, so building once at the root makes every package and example use your local copy.

## Configure

Create `simple-cdk.config.ts` at the project root:

```ts
import { defineConfig } from '@simple-cdk/core';
import { lambdaAdapter } from '@simple-cdk/lambda';
import { appSyncAdapter } from '@simple-cdk/appsync';

export default defineConfig({
  app: 'my-app',
  defaultStage: 'dev',
  stages: {
    dev: { region: 'us-east-1', removalPolicy: 'destroy', logRetentionDays: 7 },
  },
  adapters: [
    lambdaAdapter(),
    appSyncAdapter({
      schemaFile: 'schema.graphql',
      resolvers: [
        { typeName: 'Query', fieldName: 'hello', source: { kind: 'lambda', lambdaName: 'hello' } },
      ],
    }),
  ],
});
```

## Add a Lambda

```ts
// backend/functions/hello/handler.ts
export const handler = async () => 'hello world';
```

## Add a schema

```graphql
# schema.graphql
type Query {
  hello: String
}
```

## Deploy

```bash
npx simple-cdk list                  # show what each adapter discovered
npx simple-cdk synth                 # generate CloudFormation
npx simple-cdk diff --stage dev      # diff against deployed
npx simple-cdk deploy --stage dev    # push to AWS
npx simple-cdk destroy --stage dev   # tear it down
```

Forward extra args to the underlying `cdk` CLI after `--`:

```bash
npx simple-cdk deploy --stage prod -- --require-approval never --concurrency 4
```

## Stages

Stages are defined in your config. They control region, account, removal policy, log retention, env vars, and tags. The CLI picks one via:

1. `--stage <name>` flag
2. `defaultStage` in your config
3. The first key of `stages` (alphabetical)

Each stage gets its own CloudFormation stacks, scoped as `<app>-<stage>-<stack>`.

## What's next

- [Home](./Home.md) for the full reference of every built-in adapter
- [Architecture](./Architecture.md) for what the engine does and where adapters fit
- [Extending](./Extending.md) to override an adapter or write a new one
