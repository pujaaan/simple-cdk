# simple-cdk

> Build on AWS without being an AWS expert.

simple-cdk is a thin convention layer on top of [AWS CDK](https://aws.amazon.com/cdk/). You describe your app in one `simple-cdk.config.ts`, drop code into a few conventional folders, and the built-in **adapters** turn it into Lambda functions, DynamoDB tables, an AppSync GraphQL API, a Cognito user pool, an RDS database, and a bundled outputs parameter for frontends. Every adapter is optional, every adapter is replaceable, and raw CDK is always one line away.

It is **not** a framework, not a deploy service, and not an opinionated runtime. There's no proprietary format, no daemon, no console. The output is plain CloudFormation. Delete `simple-cdk.config.ts`, swap in a hand-written CDK app, and keep deploying. simple-cdk and raw CDK compose in the same project: `ctx.stack(name)` returns a real `cdk.Stack`, and you can attach any construct from `aws-cdk-lib` next to anything an adapter created. You can also embed simple-cdk inside an existing CDK app; see [Adopting → Embedding in an existing CDK app](Adopting.md#embedding-in-an-existing-cdk-app).

---

## Start here

| | |
|---|---|
| **New?** | [Getting Started](Getting-Started.md) |
| **Choosing a tool?** | [Comparison: vs raw CDK, Amplify, SST](Comparison.md) |
| **Want the big picture?** | [Architecture](Architecture.md) |
| **Ready to customize?** | [Extending](Extending.md) |
| **Adopting an existing stack?** | [Adopting an existing deployment](Adopting.md) |
| **Hit an error?** | [Errors](Errors.md) |

---

## Quick start

Run this in **any folder you want your project to live in**: a brand new empty directory, or the root of an existing repo.

```bash
mkdir my-app && cd my-app                # or: cd into an existing project root
npx simple-cdk@latest init               # prompts you, then installs + scaffolds
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
  // Optional: declare non-key fields for schema generation.
  // DynamoDB itself stays schemaless; `attributes` is only read by
  // `simple-cdk generate-schema`.
  attributes: {
    title: { type: 'String', required: true },
    completed: { type: 'Boolean' },
    createdAt: { type: 'AWSDateTime' },
  },
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

**Stream subscribers.** Declare `streamTargets` on a model to wire the table's DynamoDB stream to one or more Lambda consumers. The adapter attaches a `DynamoEventSource` in the wire phase; the named Lambda must be discovered by the lambda adapter.

```ts
// backend/models/todo.model.ts
export default {
  pk: { name: 'id' },
  streamTargets: ['on-todo-change'],      // Lambda name(s)
  streamTargetOptions: {                  // optional EventSourceMapping knobs
    startingPosition: 'LATEST',
    batchSize: 50,
    reportBatchItemFailures: true,
  },
} satisfies DynamoDbModelConfig;
```

Setting `streamTargets` implies `stream: 'NEW_AND_OLD_IMAGES'` unless you set `stream` explicitly.

**Using a table from a Lambda.** Grants and env vars are not automatic. That's by design, so least-privilege stays visible. Add a tiny wiring adapter that calls `grantReadWriteData` (or a narrower grant) and injects the table name:

```ts
// simple-cdk.config.ts
import { getLambdaFunction } from '@simple-cdk/lambda';
import { getDynamoTable } from '@simple-cdk/dynamodb';

adapters: [
  lambdaAdapter(),
  dynamoDbAdapter(),
  {
    name: 'lambda-dynamodb',
    wire: (ctx) => {
      const fn = getLambdaFunction(ctx, 'create-todo');
      const table = getDynamoTable(ctx, 'todo');
      table.grantReadWriteData(fn);                 // or grantReadData / grantWriteData
      fn.addEnvironment('TABLE_NAME', table.tableName);
    },
  },
],
```

```ts
// backend/functions/create-todo/handler.ts
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';

const ddb = new DynamoDBClient({});
const TABLE = process.env.TABLE_NAME!;

export const handler = async (event: { id: string; title: string }) => {
  await ddb.send(new PutItemCommand({
    TableName: TABLE,
    Item: { id: { S: event.id }, title: { S: event.title } },
  }));
};
```

Table names also follow a fixed convention (`<app>-<stage>-<model>`) if you'd rather hardcode or derive them yourself, but piping `table.tableName` through `addEnvironment` avoids drift.

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

### `@simple-cdk/rds`

A single RDS instance (Postgres or MySQL) with a VPC (isolated subnets, no NAT gateway by default) and a managed Secrets Manager secret.

```ts
import { rdsAdapter, getRdsInstance } from '@simple-cdk/rds';

rdsAdapter({
  engine: 'postgres',                     // or 'mysql'. Required
  instanceClass: 't4g.micro',             // default
  allocatedStorageGb: 20,                 // default
  multiAz: false,                         // default
  publiclyAccessible: false,              // default (isolated subnets)
  stackName: 'data',                      // default
  // engineVersion, databaseName, vpc, securityGroup, backupRetentionDays,
  // deletionProtection, secretName, instanceConstructId, stackId, stack
})
```

The adapter does **no automatic IAM or network wiring**. Grant a Lambda access explicitly in a wiring adapter:

```ts
{
  name: 'lambda-rds',
  wire: (ctx) => {
    const db = getRdsInstance(ctx);
    const fn = ctx.resourcesOf('lambda').find(r => r.name === 'api')!.config.construct;
    db.connections.allowDefaultPortFrom(fn);
    db.secret!.grantRead(fn);
  },
}
```

Defaults: backups 7 days (14 for `prod`), storage encrypted, deletion protection follows the stage's `removalPolicy`. Lookups: `getRdsInstance`, `getRdsSecret`, `getRdsVpc`, `getRdsSecurityGroup`.

### `@simple-cdk/outputs`

Bundles arbitrary values into a single SSM `String` parameter so a frontend (or any consumer) can fetch the whole config object in one call. Runs in the wire phase, so every other adapter's resources are already registered.

```ts
import { outputsAdapter } from '@simple-cdk/outputs';
import { getUserPool } from '@simple-cdk/cognito';
import { getAppSyncApi } from '@simple-cdk/appsync';

outputsAdapter({
  collect: (ctx) => {
    const pool = getUserPool(ctx);
    const api = getAppSyncApi(ctx);
    return {
      userPoolId: pool.userPoolId,
      graphqlUrl: api.graphqlUrl,
      region: ctx.config.stageConfig.region,
    };
  },
  // parameterName defaults to `/<app>/<stage>/outputs`
  // cfnOutputs: true (default). Also emits each key as a CfnOutput
})
```

Token values from CDK (e.g. `pool.userPoolId`) are fine; they resolve at deploy time.

---

## CLI

| Command | What it does |
|---------|--------------|
| `simple-cdk list` | Run discovery and print what each adapter found. No synth, no deploy. |
| `simple-cdk create <kind> <name>` | Scaffold a new `model`, `function`, or `trigger`. Validates Cognito trigger names. `--dir <path>` to override the default folder. |
| `simple-cdk generate-schema` | Emit a `schema.graphql` covering every discovered DynamoDB model (types, connections, CRUD inputs, Query/Mutation fields). `--out <path>` to target a different file. |
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

Adapters are plain objects. Every built-in follows the same shape (a `name` plus up to three optional hooks: `discover`, `register`, `wire`), so there's nothing new to learn per service. Replace any built-in by passing your own object with the same name; write a new one for an AWS service we don't ship. See [Extending](Extending.md) for the full walkthrough including filesystem discovery, cross-adapter wiring, the AppSync auth pipeline, and a real-world prod-shaped composition.

```ts
// quickest custom adapter: three optional hooks and a name
const myAdapter: Adapter = {
  name: 'sqs',
  discover: (ctx) => [...],   // find what you're responsible for
  register: (ctx) => {...},   // turn each into a CDK construct
  wire: (ctx) => {...},       // connect to other adapters' resources
};
```

Adapters are not there to add boilerplate. They're there to give you a predictable folder layout (or your own, if you write one) without rewriting the same Lambda/DynamoDB/AppSync wiring in every project. The constructs they produce are real CDK constructs, returned via lookup helpers (`getLambdaFunction`, `getDynamoTable`, `getUserPool`, …) so you can grab and tweak them in a `wire` step.

---

## Status

Stable, in production use. Follows [SemVer](https://semver.org/): minors add features, patches fix bugs, breaking changes go in major bumps.
