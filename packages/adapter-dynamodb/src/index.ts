import { adapterOrderError, requireResource, type Adapter, type WireContext } from '@simple-cdk/core';
import type { aws_dynamodb } from 'aws-cdk-lib';
import { discoverModels } from './discover.js';
import { registerTables } from './register.js';
import type { DynamoDbAdapterOptions, DynamoDbResource } from './types.js';
import { wireStreamTargets } from './wire.js';

export type {
  AttrType,
  DynamoDbAdapterOptions,
  DynamoDbModelConfig,
  DynamoDbResource,
  GraphqlScalar,
  GsiConfig,
  KeyDef,
  ModelAttribute,
  StreamMode,
  StreamTargetOptions,
} from './types.js';
export { generateGraphQLSchema } from './schema.js';
export type { GenerateSchemaOptions } from './schema.js';

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
    discover: (ctx) => discoverModels(ctx.rootDir, dir, match, ctx.report),
    register: (ctx) => registerTables(ctx, opts),
    wire: (ctx) => wireStreamTargets(ctx),
  };
}

/** Look up a registered DynamoDB table from another adapter's wire phase. */
export function getDynamoTable(ctx: Pick<WireContext, 'resourcesOf'>, name: string): aws_dynamodb.Table {
  const all = ctx.resourcesOf('dynamodb') as DynamoDbResource[];
  const resource = requireResource(
    all.find((r) => r.name === name),
    {
      kind: 'DynamoDB table',
      name,
      available: all.map((r) => r.name),
      adapterName: 'dynamodb',
      hint: all.length === 0
        ? `no DynamoDB models were discovered — ensure dynamoDbAdapter() is in your adapters array and backend/models/${name}.model.ts exists.`
        : `create backend/models/${name}.model.ts (or set dynamoDbAdapter({ dir, match }) if your layout differs).`,
    },
  );
  if (!resource.config.construct) {
    throw adapterOrderError({ adapterName: 'dynamodb', kind: `DynamoDB table "${name}"` });
  }
  return resource.config.construct;
}
