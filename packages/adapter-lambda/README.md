# @simple-cdk/lambda

[simple-cdk](https://github.com/pujaaan/simple-cdk) adapter that auto-discovers Lambda handlers from the filesystem and creates `NodejsFunction` constructs.

## Install

```bash
npm install @simple-cdk/lambda @simple-cdk/core aws-cdk-lib constructs
```

## Convention

Each Lambda lives in its own folder under `backend/functions/<name>/`:

```
backend/functions/
├── hello/
│   ├── handler.ts          # required — exports `handler`
│   └── config.ts           # optional — exports default LambdaFunctionConfig
└── ...
```

## Usage

```ts
import { defineConfig } from '@simple-cdk/core';
import { lambdaAdapter } from '@simple-cdk/lambda';

export default defineConfig({
  app: 'my-app',
  stages: { dev: { region: 'us-east-1' } },
  adapters: [
    lambdaAdapter({
      dir: 'backend/functions',     // default
      defaultMemoryMb: 256,
      defaultTimeoutSeconds: 30,
      stackName: 'lambda',
    }),
  ],
});
```

## Per-function config (optional)

```ts
// backend/functions/hello/config.ts
import type { LambdaFunctionConfig } from '@simple-cdk/lambda';

const config: LambdaFunctionConfig = {
  memoryMb: 512,
  timeoutSeconds: 60,
  environment: { LOG_LEVEL: 'debug' },
  iamPolicies: [/* PolicyStatement[] */],
  nodeModules: ['some-bundled-pkg'],
};

export default config;
```

## Cross-adapter lookup

Other adapters can grab a registered function during the wire phase:

```ts
import { getLambdaFunction } from '@simple-cdk/lambda';

// inside another adapter's wire():
const fn = getLambdaFunction(ctx, 'hello');
queue.grantConsumeMessages(fn);
```

Full docs at the [main repo](https://github.com/pujaaan/simple-cdk).
