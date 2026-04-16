# Getting Started

## Prerequisites

- Node 22 or newer (we use native TypeScript stripping)
- AWS account + credentials (`aws configure` or environment variables)
- A bootstrapped CDK environment in your target region: `npx cdk bootstrap aws://<account>/<region>`

## Install

For now this monorepo isn't published to npm. Use it locally:

```bash
git clone <this repo>
cd "AWS CDK"
npm install
npm run build
```

To consume the packages from another project (until we publish), either:

- Add the monorepo path to your project's `package.json` via `file:` references, or
- Copy the relevant `packages/*` folders into your repo and adjust imports

## Create a project

```bash
mkdir my-app && cd my-app
npm init -y
npm pkg set type=module
npm install aws-cdk-lib constructs aws-cdk
# add the simple-cdk packages by file reference for now
```

Create `simple-cdk.config.ts` at the project root:

```ts
import { defineConfig } from '@simple-cdk/core';
import { lambdaAdapter } from '@simple-cdk/lambda';

export default defineConfig({
  app: 'my-app',
  stages: { dev: { region: 'us-east-1', removalPolicy: 'destroy' } },
  adapters: [lambdaAdapter()],
});
```

Add a Lambda:

```ts
// backend/functions/hello/handler.ts
export const handler = async (event: unknown) => ({ message: 'hello' });
```

## Run

```bash
npx simple-cdk list                  # show what was discovered
npx simple-cdk synth                 # build CloudFormation
npx simple-cdk diff --stage dev      # diff against deployed
npx simple-cdk deploy --stage dev    # push it up
npx simple-cdk destroy --stage dev   # tear it down
```

Forward extra args to the underlying `cdk` CLI after `--`:

```bash
npx simple-cdk deploy --stage prod -- --require-approval never --concurrency 4
```

## Stages

Stages are defined in your config. They control which AWS region you're targeting, what the removal policy is, log retention, env vars, and tags. The CLI picks one via:

1. `--stage <name>` flag
2. `defaultStage` in your config
3. The first key of `stages` (alphabetical)

Each stage gets its own CloudFormation stacks, scoped by name (`<app>-<stage>-<stack>`).

## What's next

- [Architecture](./architecture.md) — what the engine does and where adapters fit
- [Extending](./extending.md) — write or override adapters
