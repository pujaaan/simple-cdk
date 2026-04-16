# Architecture

simple-cdk is split into three layers — your code only ever touches the top two.

```
┌─────────────────────────────────────────────────────────┐
│  YOUR PROJECT                                           │
│   simple-cdk.config.ts · backend/* · custom adapters    │
├─────────────────────────────────────────────────────────┤
│  ADAPTERS                                               │
│   lambda · dynamodb · appsync · cognito · (yours)       │
├─────────────────────────────────────────────────────────┤
│  ENGINE  (@simple-cdk/core — never changes)             │
│   discover → register → wire → synth                    │
└─────────────────────────────────────────────────────────┘
```

## The engine

The engine is a few hundred lines. It knows nothing about Lambda, DynamoDB, or any specific AWS service. Its job is:

1. Resolve your config (which stage, which region, which adapters)
2. Run the lifecycle in order
3. Hand each adapter a typed context

You won't usually touch the engine directly — the CLI does.

## The lifecycle

For each `simple-cdk synth | deploy | diff` run:

```
┌─ for each adapter ─┐    ┌─ for each adapter ─┐    ┌─ for each adapter ─┐
│  discover()         │ → │  register()         │ → │  wire()              │
│  scan filesystem    │    │  create CDK         │    │  cross-reference     │
│  return Resource[]  │    │  constructs         │    │  other adapters      │
└─────────────────────┘    └─────────────────────┘    └──────────────────────┘
```

- **discover** — find what the adapter is responsible for (handler files, model files, trigger folders). Pure read.
- **register** — instantiate CDK constructs (`new NodejsFunction()`, `new dynamodb.Table()`, etc.). One stack per logical group.
- **wire** — connect to other adapters' resources (e.g., AppSync looks up Lambda functions registered by the lambda adapter).

All three phases are optional. An adapter that only adds a CLI command implements none of them.

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

That's the whole API surface. Anything that satisfies this is a valid adapter.

### Resources

A `Resource` is whatever an adapter wants to remember between phases:

```ts
interface Resource<TConfig = unknown> {
  type: string;
  name: string;
  source: string;
  config: TConfig;
}
```

Adapters define their own `TConfig`. The engine treats it as opaque — it just shuttles resources between phases.

### Contexts

Each phase gets a context that exposes only what's safe at that point:

| Phase | Has access to |
|-------|---------------|
| `discover` | `rootDir`, `config` (stage, region, etc.), `log` |
| `register` | All of the above plus the CDK `App`, the `stack(name)` factory, this adapter's resources, all adapters' resources |
| `wire` | Everything in `register` plus `resourcesOf(adapterName)` for cross-adapter lookup |

## Stacks

Adapters get stacks via `ctx.stack(name)`. The engine creates one CDK stack per logical name, scoped as `<app>-<stage>-<name>`. Two adapters that ask for the same stack name share one stack — that's how the dynamodb and lambda adapters can both put resources into a `data` stack if you want.

Defaults:

| Adapter | Default stack name |
|---------|--------------------|
| `lambda` | `lambda` |
| `dynamodb` | `data` |
| `cognito` | `auth` |
| `appsync` | `api` |

Override via the adapter's `stackName` option, or per-resource via the resource's own `stack` field where supported.

## Configuration

Your `simple-cdk.config.ts` is the only project-level file the engine reads. It's pure data — no side effects, no I/O. The shape:

```ts
interface AppConfig {
  app: string;                              // logical app name, used in resource ids
  stages: Record<string, StageConfig>;      // dev, staging, prod, …
  adapters: Adapter[];                      // ordered — discovery and register run in this order
  defaultStage?: string;
  rootDir?: string;                         // override cwd for filesystem scans
}

interface StageConfig {
  region: string;                           // required — engine ships no defaults
  account?: string;
  removalPolicy?: 'destroy' | 'retain' | 'snapshot';
  logRetentionDays?: number;
  tags?: Record<string, string>;
  env?: Record<string, string>;
}
```

The engine validates these at synth time and gives you actionable errors before anything hits AWS.

## Why this shape

A few principles drove the design:

- **The engine has zero opinions about AWS services.** Every assumption belongs in an adapter, and every adapter is replaceable.
- **No domain logic anywhere in core.** No hardcoded regions, no role models, no tenant assumptions, no account fanout.
- **Adapters compose, not inherit.** You add behavior by adding adapters or replacing them, never by extending the engine.
- **CDK is right there.** Adapters create normal CDK constructs. You can break out of the abstraction at any time without rewriting the rest.

See [extending](./extending.md) for how to actually use these hooks.
