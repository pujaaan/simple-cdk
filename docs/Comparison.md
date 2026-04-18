# Choosing simple-cdk

simple-cdk is a thin convention layer on top of [AWS CDK](https://aws.amazon.com/cdk/). It is **not** a framework, **not** a deploy service, and **not** an opinionated runtime. It scans a few folders, runs adapters in a deterministic three-phase pipeline (`discover → register → wire`), and emits real CDK constructs. The output is plain CloudFormation, and you can drop into raw CDK at any point in the same project.

This page exists to make the call easy: when simple-cdk fits, when it doesn't, and how it sits next to the alternatives.

## What it is in 30 seconds

- One `simple-cdk.config.ts` describes your app.
- A few conventional folders (`backend/functions/`, `backend/models/`, `backend/triggers/`) become Lambdas, DynamoDB tables, and Cognito triggers via built-in adapters.
- Each adapter is a plain object with three optional hooks and a name. You can replace any built-in or write your own.
- The CLI wraps `cdk` (`simple-cdk deploy` calls `cdk deploy` under the hood), so anything you already know about CDK still applies.

There is no proprietary runtime in your Lambdas, no deploy daemon, no console, no telemetry. Delete `simple-cdk.config.ts` and you can keep deploying with a hand-written CDK app, because every construct simple-cdk produces is standard `aws-cdk-lib`.

## Pros

- **Thin layer.** The engine is a few hundred lines and knows nothing about Lambda, DynamoDB, or any specific AWS service. Every assumption lives in an adapter.
- **Output is CloudFormation.** No vendor lock-in beyond what CDK itself implies. `cdk synth` works the same as in any other CDK project.
- **Mixable with raw CDK.** `ctx.stack(name)` returns a real `Stack`. You can attach any construct from `aws-cdk-lib` next to anything an adapter created.
- **Replaceable.** Override any built-in by passing your own object with the same `name`. No fork required.
- **Same pattern, every adapter.** `discover` finds work, `register` builds CDK constructs, `wire` cross-references other adapters' resources. There is nothing else to learn.
- **Multi-stage out of the box.** `dev`/`staging`/`prod` (and ad-hoc sandboxes) are first-class. Pass `--stage` and the engine wires region, removal policy, and log retention from your config.
- **TypeScript-first, fully typed.** `defineConfig`, adapter contracts, and lookup helpers (`getLambdaFunction`, `getDynamoTable`, `getUserPool`, etc.) are all typed.

## Cons

- **Built-ins target serverless.** Lambda, DynamoDB, AppSync, Cognito, RDS, and an outputs SSM parameter ship today. Anything else, you write the adapter (small interface, but still your code).
- **No frontend, no hosting.** simple-cdk does backend infrastructure only. If you want a framework that also hosts your frontend, look elsewhere.
- **Small ecosystem.** One maintainer, no plugin marketplace. The flip side is no plugin marketplace to wade through.
- **Convention-light.** You still write a config file. This is not "click a button and a backend appears"; it is "stop rewriting the same CDK wiring in every project."

## How simple-cdk sits next to raw CDK

simple-cdk does not replace CDK. It composes with it.

- The engine creates `cdk.Stack`s on demand via `ctx.stack(name)`. You can grab any of those stacks and instantiate raw constructs in them.
- Built-in adapters expose lookup helpers (`getLambdaFunction(ctx, 'my-fn')`, `getDynamoTable(ctx, 'todo')`) that return the underlying CDK constructs. Call any CDK method on them.
- A custom adapter is just a plain object. Inside `register` or `wire`, write whatever CDK code you want: `new appsync.GraphqlApi(...)`, `new sqs.Queue(...)`, anything.
- **You can embed simple-cdk inside an existing CDK app.** `Engine.synth({ cdkApp })` accepts a pre-built `cdk.App`, and every adapter accepts an optional `stack:` to place its constructs into a `Stack` your hand-written CDK code already owns. See [Adopting → Embedding in an existing CDK app](Adopting.md#embedding-in-an-existing-cdk-app).
- If you outgrow simple-cdk, migrate one adapter at a time to a hand-written stack. CloudFormation logical IDs are stable and overridable.

The mental model: simple-cdk is the part that scans `backend/` and runs `discover → register → wire`. CDK is the part underneath that turns constructs into CloudFormation. You can keep one and replace the other, or run both side by side in the same project.

## vs Raw CDK

**Pick raw CDK when:** your topology is unusual (deeply custom multi-stack graphs, multi-account fanout, non-serverless workloads), or you want zero external dependencies beyond `aws-cdk-lib`.

**Pick simple-cdk when:** you find yourself writing the same Lambda + DynamoDB + AppSync wiring in every project, you want a single config file instead of an `app.ts` + a stack-per-service dance, or you want filesystem conventions for handlers and models without giving up the CDK escape hatch.

You don't have to pick one or the other forever, and you don't even have to pick one or the other *now*. simple-cdk produces normal CDK constructs, and the engine accepts an existing `cdk.App` via `Engine.synth({ cdkApp })`. An existing CDK project can adopt simple-cdk for one slice (say, auto-discover handlers in `backend/functions/`) without rewriting anything else.

## vs AWS Amplify (Gen 2)

**Pick Amplify when:** you want a fully managed full-stack framework that hosts frontend + backend together, you're fine living inside Amplify's deploy/runtime model, and you want first-class frontend codegen for Auth/Data.

**Pick simple-cdk when:** you want the scaffold-and-go ergonomics of Amplify but on plain CDK, with no Amplify CLI, no Amplify Hosting, and no Amplify-specific resource types in your CloudFormation. Your output is the same CloudFormation any CDK app would produce.

simple-cdk borrows Amplify's "drop a file in a folder, get a resource" feel without inheriting Amplify's runtime. If Amplify Gen 2's restrictions don't fit (custom AppSync resolvers, cross-stack constructs, your own VPC), simple-cdk is closer to the metal.

## vs SST

**Pick SST when:** you want their developer experience: `sst dev` live Lambda, the SST console, sst.dev hosted features, Resource Linking. SST owns the deploy story end-to-end.

**Pick simple-cdk when:** you'd rather have less in the loop. simple-cdk just runs `cdk deploy`. No daemon, no console, no SST-managed resources. If you want to add SST-like live Lambda, you can, but you'll wire it yourself.

Both produce CDK/CloudFormation underneath, so the migration cost in either direction is mostly about renaming things, not rewriting infrastructure.

## When to use simple-cdk

- TypeScript serverless backend on AWS: Lambda + DynamoDB + GraphQL or REST.
- Team already uses CDK and is tired of repeating wiring across projects.
- Multi-stage deploys (`dev` / `staging` / `prod` / ad-hoc sandboxes) with simple stage configuration.
- You want filesystem conventions (handlers in folders, models as files) without giving up raw CDK as an escape hatch.

## When NOT to use simple-cdk

- Non-serverless workloads (ECS/EKS/EC2-heavy). The built-in adapters don't cover these, so you'd write everything yourself.
- An existing happy CDK codebase. There's no benefit to rewriting working infra.
- You want a fully managed full-stack platform (use Amplify or SST).

## A complete config, in one file

```ts
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

That's a working backend: Lambdas auto-discovered from `backend/functions/`, DynamoDB tables from `backend/models/`, an AppSync GraphQL API with auto-generated CRUD resolvers wired to those tables. No stacks, no constructs, no IAM dance. `simple-cdk deploy --stage dev` puts it on AWS.

## Where to next

- [Getting Started](./Getting-Started.md) for install, configure, deploy.
- [Architecture](./Architecture.md) for engine, adapters, lifecycle in depth.
- [Extending](./Extending.md) to configure built-ins, override them, or write your own adapter (including a real-world prod-shaped example).
- [Adopting an existing deployment](./Adopting.md) to move an existing CloudFormation stack under simple-cdk without recreating data-bearing resources.
