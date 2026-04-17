# @simple-cdk/dynamodb

[simple-cdk](https://github.com/pujaaan/simple-cdk) adapter that auto-discovers model files and creates DynamoDB tables with GSIs, streams, and TTL.

## Install

```bash
npm install @simple-cdk/dynamodb @simple-cdk/core aws-cdk-lib constructs
```

## Convention

Each model is a `.model.ts` file under `backend/models/`:

```
backend/models/
├── todo.model.ts
├── user.model.ts
└── ...
```

## Usage

```ts
import { defineConfig } from '@simple-cdk/core';
import { dynamoDbAdapter } from '@simple-cdk/dynamodb';

export default defineConfig({
  app: 'my-app',
  stages: { dev: { region: 'us-east-1' } },
  adapters: [
    dynamoDbAdapter({
      dir: 'backend/models',                   // default
      match: ['.model.ts', '.model.js'],       // file suffixes to scan
      stackName: 'data',
    }),
  ],
});
```

## Model config

```ts
// backend/models/todo.model.ts
import type { DynamoDbModelConfig } from '@simple-cdk/dynamodb';

const todo: DynamoDbModelConfig = {
  name: 'todo',
  // tableName: 'my-existing-table',           // full name override (adopt existing table)
  pk: { name: 'id', type: 'string' },
  sk: { name: 'sk', type: 'string' },          // optional sort key
  gsis: [
    {
      name: 'byOwner',
      pk: { name: 'ownerId' },
      sk: { name: 'createdAt' },
      projection: 'ALL',
    },
  ],
  stream: 'NEW_AND_OLD_IMAGES',                // optional stream
  ttlAttribute: 'expiresAt',                   // optional TTL
  pointInTimeRecovery: true,
};

export default todo;
```

## Cross-adapter lookup

```ts
import { getDynamoTable } from '@simple-cdk/dynamodb';

// inside another adapter's wire():
const table = getDynamoTable(ctx, 'todo');
table.grantReadWriteData(myLambda);
```

Full docs at the [main repo](https://github.com/pujaaan/simple-cdk).
