# Customizing

## Why adapters are modular

Every AWS service simple-cdk ships is a separate adapter (`@simple-cdk/lambda`, `@simple-cdk/dynamodb`, `@simple-cdk/appsync`, `@simple-cdk/cognito`, `@simple-cdk/rds`, `@simple-cdk/outputs`). That split isn't cosmetic; it's what lets you bend the framework without forking it:

- **Opt in, opt out.** Only the adapters you list in `adapters: []` run. No Cognito if you don't need Cognito. No hidden resources in your CloudFormation diff.
- **Replace one, keep the rest.** Adapters match by `name`, so dropping in your own `{ name: 'lambda', ... }` swaps the built-in Lambda adapter while the others keep working. No framework-wide fork.
- **Independent stacks.** Each adapter picks its own `stackName`, so resources split into separate CloudFormation stacks (`data`, `lambda`, `api`, …) and deploy/destroy independently.
- **Tiny contract.** An adapter is a plain object with up to three hooks (`discover`, `register`, `wire`) plus a `name`. No base class, no lifecycle framework to learn.
- **Escape hatch to raw CDK.** `ctx.stack(name)` and `ctx.app` are plain CDK. Write arbitrary constructs in a wire step when the convention doesn't fit.
- **No proprietary format.** Adapters emit standard CDK constructs. If you throw simple-cdk away, you keep the CDK underneath.

The rest of this page is the *how*. Four ways to bend simple-cdk to your needs, in order of how much code you'll write:

1. **Configure**: pass options to a built-in adapter
2. **Override**: replace a built-in adapter with your own
3. **Escape hatch**: drop to raw CDK for one-off resources
4. **Add**: write a new adapter for something we don't ship

They coexist freely. You can configure most adapters, override one, drop an S3 bucket inline, and add a new adapter in the same project.

---

## 1. Configure built-in adapters

Most knobs you'll want are already exposed. A few examples:

```ts
import { lambdaAdapter } from '@simple-cdk/lambda';

lambdaAdapter({
  dir: 'src/server/functions',     // non-default directory
  defaultMemoryMb: 512,
  defaultTimeoutSeconds: 60,
  stackName: 'workers',             // separate stack from other lambdas
});
```

```ts
import { dynamoDbAdapter } from '@simple-cdk/dynamodb';

dynamoDbAdapter({
  dir: 'database/tables',
  match: ['.table.ts'],             // pick your own filename convention
});
```

```ts
import { appSyncAdapter } from '@simple-cdk/appsync';

appSyncAdapter({
  schemaFile: 'graphql/schema.graphql',
  generateCrud: {
    models: ['user', 'organization'], // only these get CRUD
    operations: ['get', 'list'],      // skip create/update/delete
    softDelete: true,
  },
  resolvers: [
    {
      typeName: 'Mutation',
      fieldName: 'archiveUser',
      source: { kind: 'lambda', lambdaName: 'archive-user' },
    },
  ],
});
```

The full option shapes live in each adapter's `types.ts` (e.g. [`packages/adapter-lambda/src/types.ts`](../packages/adapter-lambda/src/types.ts)).

### Nested layout (optional)

Adapter defaults keep the `backend/` tree flat: `backend/functions`, `backend/models`, `backend/triggers`. If you prefer a nested layout grouped by concern, `@simple-cdk/core` exports a `standardLayout` preset so you don't have to repeat path literals:

```ts
import { standardLayout } from '@simple-cdk/core';

const paths = standardLayout();   // { root: 'backend' } by default

adapters: [
  cognitoAdapter({ triggersDir: paths.triggersDir }),   // backend/auth/triggers
  dynamoDbAdapter({ dir: paths.tablesDir }),             // backend/tables
  lambdaAdapter({ dir: paths.functionsDir }),            // backend/functions
],
```

Pass `{ root: 'src/server' }` to relocate everything under a different root. `paths.apiDir` is also exposed as a conventional spot for GraphQL schema + resolver source files. The helper is purely opt-in; the flat defaults still work.

---

## 2. Override a built-in adapter

Adapters are plain objects matching the [`Adapter`](../packages/core/src/types.ts) interface. Replace any of them by passing your own implementation in `adapters: []`. The engine doesn't care where it came from.

### Wrap an existing adapter

The most common case: keep most of an adapter's behavior, change one phase.

```ts
import { lambdaAdapter } from '@simple-cdk/lambda';
import type { Adapter } from '@simple-cdk/core';
import { Tags } from 'aws-cdk-lib';

const base = lambdaAdapter({ dir: 'backend/functions' });

const taggedLambda: Adapter = {
  ...base,
  register: async (ctx) => {
    await base.register?.(ctx);
    for (const r of ctx.resources) {
      const fn = (r.config as any).construct;
      if (fn) Tags.of(fn).add('Owner', 'platform-team');
    }
  },
};

export default defineConfig({
  app: 'my-app',
  stages: { dev: { region: 'us-east-1' } },
  adapters: [taggedLambda],
});
```

### Replace it entirely

If the built-in shape doesn't fit, write your own. The discovery convention, config shape, and stack layout are entirely yours:

```ts
import type { Adapter } from '@simple-cdk/core';
import { aws_lambda as lambda } from 'aws-cdk-lib';

const myLambda: Adapter = {
  name: 'lambda',                                   // same name replaces the built-in
  discover: async (ctx) => {
    return [{ type: 'lambda', name: 'foo', source: '...', config: { /* ... */ } }];
  },
  register: (ctx) => {
    const stack = ctx.stack('lambda');
    for (const r of ctx.resources) {
      new lambda.Function(stack, r.name, { /* ... */ });
    }
  },
};
```

The engine matches adapters by `name` for the wire-phase lookup (`resourcesOf('lambda')`), so keep the name stable if other adapters depend on it.

---

## 3. Escape hatch: raw CDK next to adapters

When the convention doesn't fit, drop to raw CDK. There's no mode to flip; every `RegisterContext` and `WireContext` hands you the real `App` and real `Stack` instances, and every lookup helper (`getLambdaFunction`, `getDynamoTable`, `getUserPool`, `getRdsInstance`) returns the real CDK construct an adapter registered. Three common shapes:

### Attach a raw construct in a new stack

When you need an AWS resource that no built-in adapter covers (S3, SNS, EventBridge, Step Functions) and you don't want the overhead of writing a full adapter, register it inline with a tiny one-hook adapter:

```ts
import { defineConfig } from '@simple-cdk/core';
import { aws_s3 as s3, Duration, RemovalPolicy } from 'aws-cdk-lib';

export default defineConfig({
  app: 'my-app',
  stages: { dev: { region: 'us-east-1', removalPolicy: 'destroy' } },
  adapters: [
    lambdaAdapter(),
    {
      name: 'uploads-bucket',
      register: (ctx) => {
        const stack = ctx.stack('storage');          // new CF stack, namespaced per stage
        new s3.Bucket(stack, 'Uploads', {
          bucketName: `${ctx.config.app}-${ctx.config.stage}-uploads`,
          lifecycleRules: [{ expiration: Duration.days(30) }],
          removalPolicy: ctx.config.stageConfig.removalPolicy === 'destroy'
            ? RemovalPolicy.DESTROY
            : RemovalPolicy.RETAIN,
          autoDeleteObjects: ctx.config.stageConfig.removalPolicy === 'destroy',
        });
      },
    },
  ],
});
```

`ctx.stack(name)` returns a plain `cdk.Stack`. `new s3.Bucket(stack, ...)` is the same call you'd write in a hand-written CDK app.

### Define your own `Construct` class

For a reusable shape, write a normal CDK construct and instantiate it from a wire-phase adapter. Nothing simple-cdk specific:

```ts
import { Construct } from 'constructs';
import { aws_sns as sns, aws_sns_subscriptions as subs, aws_sqs as sqs } from 'aws-cdk-lib';

export class FanoutTopic extends Construct {
  readonly topic: sns.Topic;
  constructor(scope: Construct, id: string, props: { queueCount: number }) {
    super(scope, id);
    this.topic = new sns.Topic(this, 'Topic');
    for (let i = 0; i < props.queueCount; i++) {
      const q = new sqs.Queue(this, `Q${i}`);
      this.topic.addSubscription(new subs.SqsSubscription(q));
    }
  }
}

// wire it up alongside adapter-managed resources
{
  name: 'order-events',
  wire: (ctx) => {
    const stack = ctx.stack('events');
    const fanout = new FanoutTopic(stack, 'OrderEvents', { queueCount: 3 });
    const publisher = getLambdaFunction(ctx, 'place-order');
    fanout.topic.grantPublish(publisher);
    publisher.addEnvironment('ORDER_TOPIC_ARN', fanout.topic.topicArn);
  },
}
```

### Mutate an adapter's construct

Every adapter-owned construct is exposed via a lookup helper. Reach in, tweak, drop to the L1 `Cfn*` layer if you need a property CDK doesn't surface:

```ts
import { getDynamoTable } from '@simple-cdk/dynamodb';
import { aws_dynamodb as dynamodb } from 'aws-cdk-lib';

{
  name: 'table-tuning',
  wire: (ctx) => {
    const table = getDynamoTable(ctx, 'todo');
    const cfn = table.node.defaultChild as dynamodb.CfnTable;
    cfn.addPropertyOverride('ContributorInsightsSpecification.Enabled', true);
  },
}
```

When do you want an escape hatch over writing a full adapter? When the resource is one-off (a single bucket, one EventBridge rule), when you're prototyping, or when you need a property the built-in adapter doesn't expose. Graduate to a full adapter (next section) when the pattern repeats across functions or projects.

---

## 4. Write a new adapter

Same shape as overriding, just a new `name`. Example: an SQS adapter that auto-discovers queue definitions from disk.

### Step 1: define the resource shape

```ts
// adapters/sqs/types.ts
import type { Resource } from '@simple-cdk/core';
import type { aws_sqs } from 'aws-cdk-lib';

export interface SqsModelConfig {
  name?: string;
  fifo?: boolean;
  visibilityTimeoutSeconds?: number;
  deadLetterMaxReceiveCount?: number;
}

export interface SqsResourceConfig {
  modelConfig: SqsModelConfig;
  construct?: aws_sqs.Queue;
}

export type SqsResource = Resource<SqsResourceConfig> & { type: 'sqs-queue' };
```

### Step 2: write the adapter

```ts
// adapters/sqs/index.ts
import type { Adapter, WireContext } from '@simple-cdk/core';
import { scanFiles } from '@simple-cdk/core';
import { Duration, aws_sqs as sqs } from 'aws-cdk-lib';
import { pathToFileURL } from 'node:url';
import type { SqsModelConfig, SqsResource } from './types.js';

export interface SqsAdapterOptions {
  dir?: string;
  stackName?: string;
}

export function sqsAdapter(opts: SqsAdapterOptions = {}): Adapter {
  const dir = opts.dir ?? 'backend/queues';
  return {
    name: 'sqs',

    discover: async (ctx) => {
      const files = await scanFiles(ctx.rootDir, { dir, match: ['.queue.ts'] });
      const found = [];
      for (const f of files) {
        const mod = await import(pathToFileURL(f.absolutePath).href);
        const modelConfig = (mod.default ?? mod.queue) as SqsModelConfig | undefined;
        if (!modelConfig) continue;
        found.push({
          type: 'sqs-queue' as const,
          name: modelConfig.name ?? f.stem,
          source: f.absolutePath,
          config: { modelConfig },
        });
      }
      return found;
    },

    register: (ctx) => {
      const stack = ctx.stack(opts.stackName ?? 'queues');
      for (const r of ctx.resources as SqsResource[]) {
        const cfg = r.config.modelConfig;
        const queue = new sqs.Queue(stack, r.name, {
          queueName: `${ctx.config.app}-${ctx.config.stage}-${r.name}`,
          fifo: cfg.fifo,
          visibilityTimeout: Duration.seconds(cfg.visibilityTimeoutSeconds ?? 30),
          deadLetterQueue: cfg.deadLetterMaxReceiveCount
            ? {
                maxReceiveCount: cfg.deadLetterMaxReceiveCount,
                queue: new sqs.Queue(stack, r.name + 'Dlq', { fifo: cfg.fifo }),
              }
            : undefined,
        });
        r.config.construct = queue;
      }
    },
  };
}

export function getQueue(ctx: Pick<WireContext, 'resourcesOf'>, name: string): sqs.Queue {
  const r = ctx.resourcesOf('sqs').find((r) => r.name === name) as SqsResource | undefined;
  if (!r?.config.construct) throw new Error(`Queue "${name}" not registered`);
  return r.config.construct;
}
```

### Step 3: use it

```ts
import { sqsAdapter, getQueue } from './adapters/sqs/index.js';

export default defineConfig({
  app: 'my-app',
  stages: { dev: { region: 'us-east-1' } },
  adapters: [
    lambdaAdapter(),
    sqsAdapter({ dir: 'backend/queues' }),
    // a tiny wiring adapter that grants Lambdas SQS permissions
    {
      name: 'lambda-sqs-bindings',
      wire: (ctx) => {
        const fn = ctx.resourcesOf('lambda').find((r) => r.name === 'process-orders');
        const queue = getQueue(ctx, 'orders');
        queue.grantConsumeMessages((fn?.config as any).construct);
      },
    },
  ],
});
```

---

## The adapter contract

```ts
interface Adapter {
  name: string;
  discover?(ctx: DiscoveryContext): Promise<Resource[]> | Resource[];
  register?(ctx: RegisterContext): void | Promise<void>;
  wire?(ctx: WireContext): void | Promise<void>;
  commands?(): Command[];
}
```

| Hook | What it gets | What it does |
|------|--------------|--------------|
| `discover` | `rootDir`, `config`, `log` | Scan filesystem (or anywhere) and return a list of `Resource` objects. Pure read. |
| `register` | All of the above plus the CDK `App`, `stack(name)`, this adapter's resources, all adapters' resources | Create CDK constructs. Stash the construct on the resource for the wire phase. |
| `wire` | All of the above plus `resourcesOf(adapterName)` | Cross-reference resources from other adapters and connect them. |
| `commands` | none | Optional CLI commands this adapter contributes. |

All hooks are optional. An adapter can do discovery only, registration only, or any combination.

---

## Pluggable auth pipeline (AppSync)

The AppSync adapter ships with a no-op auth pass-through so the seed works out of the box. Real apps replace it.

The auth pipeline is an [AppSync JS function](https://docs.aws.amazon.com/appsync/latest/devguide/resolver-reference-overview-js.html) that runs as the first step of every resolver pipeline. Provide it as a JS file:

```ts
appSyncAdapter({
  schemaFile: 'schema.graphql',
  authPipeline: { jsFile: 'resolvers/auth-pipeline.js' },
});
```

```js
// resolvers/auth-pipeline.js
import { util } from '@aws-appsync/utils';

export function request(ctx) {
  const claims = ctx.identity?.claims ?? {};
  if (!claims.sub) util.unauthorized();
  ctx.stash.userId = claims.sub;
  ctx.stash.roles = (claims['custom:roles'] ?? '').split(',').filter(Boolean);
  return {};
}

export function response(ctx) {
  return ctx.prev.result;
}
```

Resolvers can opt out per-field with `bypassAuth: true`.

---

## When to write your own vs use what we ship

Write your own when:

- The convention doesn't fit (different file layout, different config shape)
- You need behavior we don't expose as an option
- You want different defaults across multiple projects (one shared adapter package, many consumers)
- You're integrating an AWS service we don't ship an adapter for (SQS, SNS, EventBridge, Step Functions, S3, etc.)

Use what we ship when:

- The convention fits and the options cover what you need
- You want fewer moving parts
- You're prototyping

The adapter contract is small enough that going from "I'll use the built-in" to "actually I need my own" is rarely a rewrite. Most of the time you're swapping a constant for an import.

---

## Composing custom adapters: a real-world shape

The minimal config in [Home](./Home.md) lists three built-in adapters and that's the whole app. Real production apps tend to mix built-ins, custom adapters, and direct calls to lower-level building blocks like `buildApi` from `@simple-cdk/appsync`. The shape stays the same (`defineConfig({ adapters: [...] })`), but each entry can be as plain or as bespoke as the project needs.

This is the adapter list from a production multi-tenant healthcare backend. Names are project-specific; the pattern is not:

```ts
// simple-cdk.config.ts
adapters: [
  myDataAdapter(),                    // custom: domain-shaped DynamoDB models with tenant-isolation metadata
  cognitoAdapter({                    // built-in: user pool + 4 triggers + MFA + password policy
    triggersDir: 'backend/auth/triggers',
    mfa: 'optional',
    passwordPolicy: { minLength: 12, requireSymbols: true /* ... */ },
  }),
  myAuthExtrasAdapter(),              // custom: identity pool, SES, pre-token-generation grants
  myStorageAdapter(),                 // custom: S3 buckets (logos, signatures, attachments)
  myFunctionsAdapter(),               // custom: like @simple-cdk/lambda but per-domain config metadata
  myWarehouseAdapter(),               // custom: RDS + VPC + DynamoDB stream consumer + EventBridge schedules
  myApiAdapter(),                     // custom: uses buildApi() directly to drop resolvers into nested stacks
  outputsAdapter({                    // built-in: SSM parameter for frontend config
    parameterName: `/my-app/${stage}/aws-config`,
    collect: (ctx) => ({
      region: ctx.config.stageConfig.region,
      userPoolId: getUserPool(ctx).userPoolId,
      userPoolClientId: getUserPoolClient(ctx).userPoolClientId,
      // ... plus identity pool id, AppSync URL, bucket names from custom adapters
    }),
  }),
],
```

A few things worth noticing:

- **Built-ins and customs are listed exactly the same way.** The engine doesn't care which is which.
- **Customs handle the parts the built-ins don't cover:** Cognito identity pools, S3 buckets, RDS in a VPC built dynamically, AppSync resolvers split across nested stacks for the 500-resource CloudFormation limit.
- **The custom API adapter uses `buildApi` directly** instead of `appSyncAdapter()`. `buildApi`, `attachCrudResolvers`, and `attachManualResolvers` are exported from `@simple-cdk/appsync` for exactly this case: when the high-level adapter doesn't fit, drop one level deeper but keep the CRUD pipeline.
- **`outputsAdapter` is the seam between custom and built-in.** It pulls the user pool from `@simple-cdk/cognito`, the API from a custom adapter, and bucket names from another custom adapter, then bundles them into one SSM parameter the frontend reads at boot.
- **Stack ids are pinned** (`stackId: \`my-app-ApiStack-${stage}\``) so the project can adopt this shape over an existing CloudFormation deployment without recreating data-bearing resources. See [Adopting](./Adopting.md).

The point: there is no "production mode" of simple-cdk. The same engine and the same adapter contract handle the minimal example and the multi-adapter prod shape. You opt into complexity when you need it, and only for the parts that need it.

---

## See also

- [Home](./Home.md) for the full per-adapter reference
- [Architecture](./Architecture.md) for how the engine works under the hood
- [Comparison](./Comparison.md) for pros/cons and how simple-cdk sits next to raw CDK, Amplify, and SST
- [Getting Started](./Getting-Started.md) for installation and your first deploy
