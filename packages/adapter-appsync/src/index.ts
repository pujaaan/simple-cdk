import { adapterNotRun, type Adapter, type WireContext } from '@simple-cdk/core';
import type { DynamoDbResource } from '@simple-cdk/dynamodb';
import type { aws_appsync } from 'aws-cdk-lib';
import { attachCrudResolvers, attachManualResolvers, buildApi, getBuiltApi } from './api.js';
import type { AppSyncAdapterOptions } from './types.js';

export type {
  AppSyncAdapterOptions,
  AuthorizationMode,
  AuthPipelineSpec,
  CrudGenSpec,
  CrudOperation,
  ResolverSpec,
  ResolverSource,
  StashCode,
  StashLiteral,
  StashValue,
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

/**
 * Look up the registered GraphQL API from another adapter's wire phase.
 * Throws if the AppSync adapter hasn't run yet. Useful for attaching
 * additional data sources, custom resolvers, or extracting the api URL
 * into outputs.
 */
export function getAppSyncApi(ctx: Pick<WireContext, 'app'>): aws_appsync.GraphqlApi {
  const built = getBuiltApi(ctx);
  if (!built) {
    throw adapterNotRun({
      adapterName: 'appsync',
      kind: 'AppSync API',
      adapterCall: 'appSyncAdapter({ schemaFile: "schema.graphql" })',
    });
  }
  return built.api;
}
