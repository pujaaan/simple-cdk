import type { Adapter, WireContext } from '@simple-cdk/core';
import type { aws_dynamodb } from 'aws-cdk-lib';
import { discoverModels } from './discover.js';
import { registerTables } from './register.js';
import type { DynamoDbAdapterOptions, DynamoDbResource } from './types.js';

export type {
  AttrType,
  DynamoDbAdapterOptions,
  DynamoDbModelConfig,
  DynamoDbResource,
  GsiConfig,
  KeyDef,
  StreamMode,
} from './types.js';

const DEFAULT_MATCH = ['.model.ts', '.model.mts', '.model.js', '.model.mjs'];

/**
 * The default DynamoDB adapter. Discovers `*.model.ts` files and creates
 * tables based on the exported model config.
 */
export function dynamoDbAdapter(opts: DynamoDbAdapterOptions = {}): Adapter {
  const dir = opts.dir ?? 'backend/models';
  const match = opts.match ?? DEFAULT_MATCH;
  return {
    name: 'dynamodb',
    discover: (ctx) => discoverModels(ctx.rootDir, dir, match),
    register: (ctx) => registerTables(ctx, opts),
  };
}

/** Look up a registered DynamoDB table from another adapter's wire phase. */
export function getDynamoTable(ctx: Pick<WireContext, 'resourcesOf'>, name: string): aws_dynamodb.Table {
  const resource = ctx.resourcesOf('dynamodb').find((r) => r.name === name) as DynamoDbResource | undefined;
  if (!resource) {
    throw new Error(`DynamoDB table "${name}" was not discovered. Check the model file name.`);
  }
  if (!resource.config.construct) {
    throw new Error(`DynamoDB table "${name}" was not registered. Did the dynamodb adapter run?`);
  }
  return resource.config.construct;
}
