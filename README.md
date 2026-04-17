# simple-cdk

Build on AWS without being an AWS expert.

simple-cdk is a thin layer on top of [AWS CDK](https://aws.amazon.com/cdk/). You describe your app once in a single config file, drop your code into a few conventional folders, and the built-in **adapters** turn it into Lambda functions, DynamoDB tables, an AppSync GraphQL API, a Cognito user pool, an RDS database, and a bundled outputs parameter for frontends. Every adapter is optional, every adapter is replaceable, and you can drop down to raw CDK any time.

## Why simple-cdk?

simple-cdk is for teams that want to ship AWS serverless backends — Lambda, DynamoDB, AppSync (GraphQL), Cognito — without writing a mountain of CDK boilerplate. It's **convention-over-configuration for AWS CDK**, borrowing the scaffold-and-go simplicity of tools like [AWS Amplify](https://aws.amazon.com/amplify/) while staying on plain CDK so you keep an escape hatch into raw constructs.

**Reach for simple-cdk when you want to:**

- Deploy AWS Lambda + DynamoDB + GraphQL without hand-wiring CDK stacks for every resource
- Use AWS CDK but stop repeating the same resource-wiring patterns across projects
- Scaffold a TypeScript serverless backend on AWS in one command (`npx simple-cdk init`)
- Auto-generate CRUD resolvers for DynamoDB-backed AppSync APIs
- Keep Amplify-style scaffolding ergonomics on projects where Amplify's restrictions won't fit

**Prefer plain CDK or Amplify when:** you have non-serverless workloads (ECS/EKS/EC2-heavy), deeply custom multi-stack topologies, an existing CDK codebase you're happy with, or you want a fully managed full-stack framework that hosts frontend + backend together.

## Quick start

Run this in **any folder you want your project to live in**: a brand new empty directory, or the root of an existing repo.

```bash
mkdir my-app && cd my-app                # or: cd into an existing project root
npx simple-cdk@latest init               # prompts you, then installs + scaffolds
```

`init` walks you through:

- App name, AWS region, default stage
- Which built-in adapters to include (`lambda`, `dynamodb`, `appsync`, `cognito`)

Then it installs the right packages, writes a working `simple-cdk.config.ts`, and creates the `backend/` folders for the adapters you picked. When it's done:

```bash
npx cdk bootstrap                        # one-time per region/account
npx simple-cdk deploy --stage dev        # push to AWS
```

You'll need Node 22+ and AWS credentials (`aws configure` or `AWS_PROFILE`) on the machine you run this from.

See [examples/01-minimal](./examples/01-minimal) and [examples/02-with-models](./examples/02-with-models) for fully wired projects.

## Manual install

Skip `init` if you'd rather wire things up by hand or pin specific versions.

### From npm

```bash
npm install aws-cdk-lib constructs aws-cdk
npm install @simple-cdk/core simple-cdk
# adapters: install only the ones you need
npm install @simple-cdk/lambda @simple-cdk/dynamodb @simple-cdk/appsync @simple-cdk/cognito
# optional extras: RDS and a bundled-outputs SSM parameter for frontends
npm install @simple-cdk/rds @simple-cdk/outputs
```

Then create `simple-cdk.config.ts` at your project root:

```ts
import {defineConfig} from '@simple-cdk/core'
import {lambdaAdapter} from '@simple-cdk/lambda'
import {dynamoDbAdapter} from '@simple-cdk/dynamodb'
import {appSyncAdapter} from '@simple-cdk/appsync'

export default defineConfig({
  app: 'my-app',
  defaultStage: 'dev',
  stages: {
    dev: {region: 'us-east-1', removalPolicy: 'destroy'},
    prod: {region: 'us-east-1', removalPolicy: 'retain', logRetentionDays: 365},
  },
  adapters: [
    lambdaAdapter(),
    dynamoDbAdapter(),
    appSyncAdapter({
      schemaFile: 'schema.graphql',
      generateCrud: {models: 'all'},
    }),
  ],
})
```

### From git

Use this if you want to hack on simple-cdk itself or run the bundled examples.

```bash
git clone https://github.com/pujaaan/simple-cdk.git
cd simple-cdk
npm install
npm run build
```

## What's included

Each adapter follows the same pattern: drop files in a folder, the adapter discovers them, the engine turns them into CDK resources.

### `@simple-cdk/lambda`

Auto-discovers Lambda handlers from `backend/functions/`.

```
backend/functions/
  hello/
    handler.ts          # required, exports `handler`
    config.ts           # optional, per-function options
```

```ts
lambdaAdapter({
  dir: 'backend/functions', // default
  defaultMemoryMb: 256,
  defaultTimeoutSeconds: 30,
  stackName: 'lambda', // default
})
```

Per-function `config.ts` lets you override memory, timeout, runtime, environment, and IAM policies. Defaults: `nodejs20.x`, 256 MB, 30 s.

### `@simple-cdk/dynamodb`

Model-driven DynamoDB tables from `backend/models/*.model.ts`.

```ts
// backend/models/todo.model.ts
import type {DynamoDbModelConfig} from '@simple-cdk/dynamodb'

export default {
  pk: {name: 'id'},
  // sk, gsis, stream, ttlAttribute, billingMode all supported
} satisfies DynamoDbModelConfig
```

```ts
dynamoDbAdapter({
  dir: 'backend/models', // default
  match: ['.model.ts', '.model.js'], // default
  stackName: 'data', // default
})
```

Defaults: `PAY_PER_REQUEST`, point-in-time recovery on. Table name: `<app>-<stage>-<model>`.

Declare `streamTargets` on a model to wire the table's stream to one or more Lambda consumers (the adapter attaches a `DynamoEventSource` in the wire phase):

```ts
export default {
  pk: {name: 'id'},
  streamTargets: ['on-todo-change'],
  streamTargetOptions: {startingPosition: 'LATEST', batchSize: 50},
} satisfies DynamoDbModelConfig
```

### `@simple-cdk/appsync`

GraphQL API from a schema file. Auto-generates CRUD resolvers for any DynamoDB model and exposes a pluggable auth pipeline.

```ts
appSyncAdapter({
  schemaFile: 'schema.graphql', // required
  apiName: 'api', // default
  authorization: {kind: 'api-key'}, // or 'iam' | 'cognito'
  generateCrud: {
    models: 'all', // or ['todo', 'user']
    operations: ['get', 'list', 'create', 'update', 'delete'],
    softDelete: false,
  },
  resolvers: [
    // manual resolvers for anything CRUD doesn't cover
    {
      typeName: 'Query',
      fieldName: 'hello',
      source: {kind: 'lambda', lambdaName: 'hello'},
    },
  ],
  authPipeline: {jsFile: 'resolvers/auth.js'}, // optional
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
  poolName: 'users', // default
  triggersDir: 'backend/triggers', // default
  signInAlias: 'email', // default
  selfSignUp: true, // default
  mfa: 'off', // 'optional' | 'required'
  // standardAttributes, customAttributes, passwordPolicy supported
})
```

Folder names map to Cognito triggers: `pre-sign-up`, `post-confirmation`, `pre-authentication`, `post-authentication`, `pre-token-generation`, `custom-message`, `define-auth-challenge`, `create-auth-challenge`, `verify-auth-challenge`, `user-migration`.

### `@simple-cdk/rds`

A single RDS instance (Postgres or MySQL) with a VPC (isolated subnets, no NAT gateway by default) and a managed Secrets Manager secret.

```ts
import {rdsAdapter, getRdsInstance} from '@simple-cdk/rds'

rdsAdapter({
  engine: 'postgres',           // or 'mysql' — required
  instanceClass: 't4g.micro',   // default
  allocatedStorageGb: 20,       // default
  multiAz: false,               // default
  publiclyAccessible: false,    // default
  stackName: 'data',            // default
})
```

No automatic IAM or network wiring — grant Lambdas access explicitly in a wiring adapter (`db.connections.allowDefaultPortFrom(fn); db.secret!.grantRead(fn)`). Lookups: `getRdsInstance`, `getRdsSecret`, `getRdsVpc`, `getRdsSecurityGroup`.

### `@simple-cdk/outputs`

Bundles values from your stacks into one SSM `String` parameter so a frontend can fetch the whole config object in one call.

```ts
import {outputsAdapter} from '@simple-cdk/outputs'
import {getUserPool} from '@simple-cdk/cognito'
import {getAppSyncApi} from '@simple-cdk/appsync'

outputsAdapter({
  collect: (ctx) => ({
    userPoolId: getUserPool(ctx).userPoolId,
    graphqlUrl: getAppSyncApi(ctx).graphqlUrl,
    region: ctx.config.stageConfig.region,
  }),
  // parameterName defaults to `/<app>/<stage>/outputs`
  // cfnOutputs: true (default) — also emit each key as a CfnOutput
})
```

Runs in the wire phase, so every other adapter's resources are already registered. Token values like `pool.userPoolId` resolve at deploy time.

### CLI

| Command                             | What it does                                                          |
| ----------------------------------- | --------------------------------------------------------------------- |
| `simple-cdk list`                   | Run discovery and print what each adapter found. No synth, no deploy. |
| `simple-cdk create <kind> <name>`   | Scaffold a `model`, `function`, or `trigger`.                         |
| `simple-cdk generate-schema`        | Emit `schema.graphql` from discovered DynamoDB models.                |
| `simple-cdk synth`                  | Generate CloudFormation.                                              |
| `simple-cdk diff`                   | Diff against the deployed stack.                                      |
| `simple-cdk deploy`                 | Push to AWS.                                                          |
| `simple-cdk destroy`                | Tear down stacks.                                                     |

Flags: `--stage <name>` to pick a stage (default: `defaultStage` in config). Anything after `--` is forwarded to the underlying `cdk` CLI:

```bash
simple-cdk deploy --stage prod -- --require-approval never --concurrency 4
```

## Customizing

Adapters are plain objects matching the [`Adapter`](./packages/core/src/types.ts) interface. The engine doesn't care where they come from. Built-in or yours, they're treated the same.

### Override a built-in adapter

Pass your own object instead of the factory result. Same `name` replaces the built-in:

```ts
import {lambdaAdapter} from '@simple-cdk/lambda'
import {Tags} from 'aws-cdk-lib'

const base = lambdaAdapter()

const taggedLambda = {
  ...base,
  register: async (ctx) => {
    await base.register?.(ctx)
    for (const r of ctx.resources) {
      const fn = (r.config as any).construct
      if (fn) Tags.of(fn).add('Owner', 'platform')
    }
  },
}

export default defineConfig({
  app: 'my-app',
  stages: {dev: {region: 'us-east-1'}},
  adapters: [taggedLambda],
})
```

### Write your own adapter

Anything not covered by a built-in adapter? Write one. It's a small interface: three optional hooks and a name.

```ts
// adapters/sqs.ts
import type {Adapter} from '@simple-cdk/core'
import {Duration, aws_sqs as sqs} from 'aws-cdk-lib'

export function sqsAdapter(opts: {queues: string[]}): Adapter {
  return {
    name: 'sqs',

    discover: () =>
      opts.queues.map((name) => ({
        type: 'sqs-queue',
        name,
        source: 'config',
        config: {},
      })),

    register: (ctx) => {
      const stack = ctx.stack('queues')
      for (const r of ctx.resources) {
        const queue = new sqs.Queue(stack, r.name, {
          queueName: `${ctx.config.app}-${ctx.config.stage}-${r.name}`,
          visibilityTimeout: Duration.seconds(30),
        })
        ;(r.config as any).construct = queue
      }
    },
  }
}
```

Use it like any built-in:

```ts
import {sqsAdapter} from './adapters/sqs.js'

adapters: [lambdaAdapter(), sqsAdapter({queues: ['orders', 'emails']})]
```

The three hooks:

- `discover(ctx)`: find what you're responsible for (scan files, read config, hit an API). Return a list of `Resource` objects.
- `register(ctx)`: turn each resource into a CDK construct. Use `ctx.stack(name)` to get-or-create a stack.
- `wire(ctx)`: runs after every adapter's `register`. Use `ctx.resourcesOf('lambda')` to look up other adapters' resources and connect them.

All three are optional. See [docs/Extending.md](./docs/Extending.md) for a complete adapter walkthrough including filesystem discovery, cross-adapter wiring, and the AppSync auth pipeline.

## Documentation

- [Getting Started](./docs/Getting-Started.md) for install, configure, deploy
- [Architecture](./docs/Architecture.md) for engine, adapters, lifecycle
- [Extending](./docs/Extending.md) to override or write adapters

## Status

Pre-1.0. APIs may change. Issues and PRs welcome at [github.com/pujaaan/simple-cdk](https://github.com/pujaaan/simple-cdk).

## License

MIT

## Blog

[https://dev.to/pujaaan/i-got-tired-of-writing-the-same-cdk-wiring-so-i-built-simple-cdk-obg](https://dev.to/pujaaan/i-got-tired-of-writing-the-same-cdk-wiring-so-i-built-simple-cdk-obg)
