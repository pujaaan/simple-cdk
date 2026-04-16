import type { Adapter } from '@simple-cdk/core';
import type { DynamoDbResource } from '@simple-cdk/dynamodb';
import { attachCrudResolvers, attachManualResolvers, buildApi } from './api.js';
import type { AppSyncAdapterOptions } from './types.js';

export type {
  AppSyncAdapterOptions,
  AuthorizationMode,
  AuthPipelineSpec,
  CrudGenSpec,
  CrudOperation,
  ResolverSpec,
  ResolverSource,
} from './types.js';
export { generateCrudCode } from './crud-generator.js';

/**
 * The default AppSync adapter. Creates a GraphQL API from a schema file,
 * attaches Lambda + DynamoDB data sources from previously-registered
 * adapters, and (optionally) auto-generates CRUD resolvers and applies
 * a pluggable auth pipeline.
 *
 * Runs in `wire` so that lambda + dynamodb adapters have already
 * registered their constructs.
 */
export function appSyncAdapter(opts: AppSyncAdapterOptions): Adapter {
  return {
    name: 'appsync',
    wire: (ctx) => {
      const built = buildApi(ctx, opts);

      if (opts.generateCrud) {
        const all = (ctx.resourcesOf('dynamodb') as DynamoDbResource[]) ?? [];
        const filter = opts.generateCrud.models;
        const target =
          !filter || filter === 'all' ? all : all.filter((r) => filter.includes(r.name));
        attachCrudResolvers(built, ctx, target, opts.generateCrud);
      }

      if (opts.resolvers?.length) {
        attachManualResolvers(built, ctx, opts.resolvers);
      }
    },
  };
}
