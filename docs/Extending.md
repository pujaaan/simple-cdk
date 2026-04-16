# Customizing

Three ways to bend simple-cdk to your needs, in order of how much code you'll write:

1. **Configure**: pass options to a built-in adapter
2. **Override**: replace a built-in adapter with your own
3. **Add**: write a new adapter for something we don't ship

All three coexist. You can configure most adapters, override one, and add a new one in the same project.

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

## 3. Write a new adapter

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
- You're integrating an AWS service we don't ship an adapter for (SQS, SNS, EventBridge, Step Functions, RDS, S3, etc.)

Use what we ship when:

- The convention fits and the options cover what you need
- You want fewer moving parts
- You're prototyping

The adapter contract is small enough that going from "I'll use the built-in" to "actually I need my own" is rarely a rewrite. Most of the time you're swapping a constant for an import.

---

## See also

- [Home](./Home.md) for the full per-adapter reference
- [Architecture](./Architecture.md) for how the engine works under the hood
- [Getting Started](./Getting-Started.md) for installation and your first deploy
