# simple-cdk

> Build on AWS without being an AWS expert.

simple-cdk is a thin layer on top of [AWS CDK](https://aws.amazon.com/cdk/). You describe your app once in a single config file, drop your code into a few conventional folders, and the built-in **adapters** turn it into Lambda functions, DynamoDB tables, an AppSync GraphQL API, and a Cognito user pool. Every adapter is optional, every adapter is replaceable, and you can drop down to raw CDK any time.

---

## Start here

| | |
|---|---|
| **New?** | [Getting Started](Getting-Started.md) |
| **Want the big picture?** | [Architecture](Architecture.md) |
| **Ready to customize?** | [Extending](Extending.md) |

---

## Quick start

Run this in **any folder you want your project to live in**: a brand new empty directory, or the root of an existing repo.

```bash
mkdir my-app && cd my-app                # or: cd into an existing project root
npx @simple-cdk/cli@latest init          # prompts you, then installs + scaffolds
```

`init` asks for app name, region, default stage, and which adapters to include, then installs the packages, writes a working `simple-cdk.config.ts`, and creates the `backend/` folders.

When it's done:

```bash
npx cdk bootstrap                        # one-time per region/account
npx simple-cdk deploy --stage dev        # push to AWS
```

Requirements: Node 22+, AWS credentials. See [Getting Started](Getting-Started.md) for the full prerequisites and the manual install path.

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
    lambdaAdapter(),
    dynamoDbAdapter(),
    appSyncAdapter({
      schemaFile: 'schema.graphql',
      generateCrud: { models: 'all' },
    }),
  ],
});
```

```bash
npx simple-cdk list                  # show what each adapter discovered
npx simple-cdk deploy --stage dev    # push to AWS
```

That's a working backend. No stacks, no constructs, no IAM dance.

---

## What's included

Each adapter follows the same pattern: drop files in a folder, the adapter discovers them, the engine turns them into CDK resources.

### `@simple-cdk/lambda`

Auto-discovers Lambda handlers from `backend/functions/`.

```
backend/functions/
  hello/
    handler.ts       # required, exports `handler`
    config.ts        # optional, per-function options
```

```ts
lambdaAdapter({
  dir: 'backend/functions',     // default
  defaultMemoryMb: 256,
  defaultTimeoutSeconds: 30,
  stackName: 'lambda',          // default
})
```

Per-function `config.ts` overrides memory, timeout, runtime, environment, and IAM policies. Defaults: `nodejs20.x`, 256 MB, 30 s.

### `@simple-cdk/dynamodb`

Model-driven DynamoDB tables from `backend/models/*.model.ts`.

```ts
// backend/models/todo.model.ts
import type { DynamoDbModelConfig } from '@simple-cdk/dynamodb';

export default {
  pk: { name: 'id' },
  // sk, gsis, stream, ttlAttribute, billingMode all supported
} satisfies DynamoDbModelConfig;
```

```ts
dynamoDbAdapter({
  dir: 'backend/models',                  // default
  match: ['.model.ts', '.model.js'],      // default
  stackName: 'data',                      // default
})
```

Defaults: `PAY_PER_REQUEST`, point-in-time recovery on. Table name: `<app>-<stage>-<model>`.

### `@simple-cdk/appsync`

GraphQL API from a schema file. Auto-generates CRUD resolvers for any DynamoDB model and exposes a pluggable auth pipeline.

```ts
appSyncAdapter({
  schemaFile: 'schema.graphql',           // required
  apiName: 'api',                         // default
  authorization: { kind: 'api-key' },     // or 'iam' | 'cognito'
  generateCrud: {
    models: 'all',                        // or ['todo', 'user']
    operations: ['get', 'list', 'create', 'update', 'delete'],
    softDelete: false,
  },
  resolvers: [
    {
      typeName: 'Query',
      fieldName: 'hello',
      source: { kind: 'lambda', lambdaName: 'hello' },
    },
  ],
  authPipeline: { jsFile: 'resolvers/auth.js' },  // optional
})
```

Runs in the wire phase, so it can see Lambdas and tables registered by other adapters.

### `@simple-cdk/cognito`

Cognito user pool + Lambda triggers from `backend/triggers/`.

```
backend/triggers/
  pre-sign-up/handler.ts
  post-confirmation/handler.ts
```

```ts
cognitoAdapter({
  poolName: 'users',                      // default
  triggersDir: 'backend/triggers',        // default
  signInAlias: 'email',                   // default
  selfSignUp: true,                       // default
  mfa: 'off',                             // 'optional' | 'required'
})
```

Folder names map to Cognito triggers: `pre-sign-up`, `post-confirmation`, `pre-authentication`, `post-authentication`, `pre-token-generation`, `custom-message`, `define-auth-challenge`, `create-auth-challenge`, `verify-auth-challenge`, `user-migration`.

---

## CLI

| Command | What it does |
|---------|--------------|
| `simple-cdk list` | Run discovery and print what each adapter found. No synth, no deploy. |
| `simple-cdk synth` | Generate CloudFormation. |
| `simple-cdk diff` | Diff against the deployed stack. |
| `simple-cdk deploy` | Push to AWS. |
| `simple-cdk destroy` | Tear down stacks. |

Flags: `--stage <name>` to pick a stage. Anything after `--` is forwarded to `cdk`:

```bash
simple-cdk deploy --stage prod -- --require-approval never --concurrency 4
```

---

## Customizing

Adapters are plain objects. Replace any built-in by passing your own. Write new ones for AWS services we don't ship. See [Extending](Extending.md) for the full walkthrough including filesystem discovery, cross-adapter wiring, and the AppSync auth pipeline.

```ts
// quickest custom adapter: three optional hooks and a name
const myAdapter: Adapter = {
  name: 'sqs',
  discover: (ctx) => [...],   // find what you're responsible for
  register: (ctx) => {...},   // turn each into a CDK construct
  wire: (ctx) => {...},       // connect to other adapters' resources
};
```

---

## Status

Pre-1.0. APIs may change.
