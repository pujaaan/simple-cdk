import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  aws_appsync as appsync,
  aws_dynamodb as ddb,
  aws_iam as iam,
  aws_lambda_nodejs as lambdaNode,
  Expiration,
  Duration,
} from 'aws-cdk-lib';
import { resourceNotFound, SimpleCdkError, type RegisterContext, type WireContext } from '@simple-cdk/core';
import type { DynamoDbResource } from '@simple-cdk/dynamodb';
import type { LambdaResource } from '@simple-cdk/lambda';
import { generateCrudCode } from './crud-generator.js';
import { PASSTHROUGH_AUTH_CODE } from './templates/auth-passthrough.js';
import type { AppSyncAdapterOptions, AuthorizationMode, ResolverSpec, StashLiteral } from './types.js';

export interface BuiltApi {
  api: appsync.GraphqlApi;
  dataSources: {
    lambda: Map<string, appsync.LambdaDataSource>;
    dynamodb: Map<string, appsync.DynamoDbDataSource>;
  };
  authFn?: appsync.AppsyncFunction;
}

const cache = new WeakMap<RegisterContext['app'], BuiltApi>();

export function getBuiltApi(ctx: Pick<WireContext, 'app'>): BuiltApi | undefined {
  return cache.get(ctx.app);
}

export function buildApi(ctx: RegisterContext, opts: AppSyncAdapterOptions): BuiltApi {
  const stack = opts.stack ?? ctx.stack(opts.stackName ?? 'api', opts.stackId ? { id: opts.stackId } : undefined);
  const apiName = opts.apiName ?? `${ctx.config.app}-${ctx.config.stage}-api`;

  const schemaPath = resolve(ctx.config.rootDir, opts.schemaFile);
  const schema = appsync.SchemaFile.fromAsset(schemaPath);

  const api = new appsync.GraphqlApi(stack, opts.apiConstructId ?? 'Api', {
    name: apiName,
    schema,
    authorizationConfig: { defaultAuthorization: toAuthMode(opts.authorization ?? { kind: 'api-key' }) },
    xrayEnabled: ctx.config.stage !== 'prod',
  });

  const lambdaSources = new Map<string, appsync.LambdaDataSource>();
  const ddbSources = new Map<string, appsync.DynamoDbDataSource>();

  for (const lambdaResource of ctx.allResources.get('lambda') ?? []) {
    const r = lambdaResource as LambdaResource;
    if (!r.config.construct) continue;
    lambdaSources.set(
      r.name,
      api.addLambdaDataSource(`Lambda${pascal(r.name)}DS`, r.config.construct as lambdaNode.NodejsFunction),
    );
  }
  for (const tableResource of ctx.allResources.get('dynamodb') ?? []) {
    const r = tableResource as DynamoDbResource;
    if (!r.config.construct) continue;
    ddbSources.set(
      r.name,
      api.addDynamoDbDataSource(`Ddb${pascal(r.name)}DS`, r.config.construct as ddb.Table),
    );
  }

  const authFn = opts.authPipeline ? buildAuthFunction(api, opts.authPipeline) : undefined;

  const built: BuiltApi = { api, dataSources: { lambda: lambdaSources, dynamodb: ddbSources }, authFn };
  cache.set(ctx.app, built);
  return built;
}

export function attachManualResolvers(built: BuiltApi, ctx: RegisterContext, resolvers: ResolverSpec[]): void {
  for (const spec of resolvers) {
    const fn = buildFunctionFromSource(built, ctx, spec);
    const pipeline: appsync.AppsyncFunction[] = [];
    if (spec.stashBefore && Object.keys(spec.stashBefore).length > 0) {
      pipeline.push(
        buildStashFunction(built.api, `StashFn${spec.typeName}${spec.fieldName}`, spec.stashBefore),
      );
    }
    if (built.authFn && !spec.bypassAuth) pipeline.push(built.authFn);
    pipeline.push(fn);

    new appsync.Resolver(built.api, `Resolver${spec.typeName}${spec.fieldName}`, {
      api: built.api,
      typeName: spec.typeName,
      fieldName: spec.fieldName,
      pipelineConfig: pipeline,
      runtime: appsync.FunctionRuntime.JS_1_0_0,
      code: PIPELINE_PASSTHROUGH,
    });
  }
}

export function attachCrudResolvers(
  built: BuiltApi,
  ctx: RegisterContext,
  models: DynamoDbResource[],
  spec: NonNullable<AppSyncAdapterOptions['generateCrud']>,
): void {
  const ops = spec.operations ?? (['get', 'list', 'create', 'update', 'delete'] as const);
  const explicitList = Array.isArray(spec.models) ? spec.models : undefined;
  for (const tableResource of models) {
    const ds = built.dataSources.dynamodb.get(tableResource.name);
    if (!ds) {
      // User explicitly listed this model → hard fail; 'all' mode → warn and skip.
      if (explicitList?.includes(tableResource.name)) {
        throw resourceNotFound({
          kind: 'DynamoDB data source',
          name: tableResource.name,
          available: [...built.dataSources.dynamodb.keys()],
          adapterName: 'appsync',
          hint: `"${tableResource.name}" is in generateCrud.models but no DynamoDB data source was built for it — ensure dynamoDbAdapter() is listed before appSyncAdapter() and the model was discovered.`,
        });
      }
      ctx.log.warn(`No DynamoDB data source for "${tableResource.name}" — skipping CRUD generation`);
      continue;
    }
    for (const op of ops) {
      const softDelete = spec.softDelete ?? false;
      const overridden = spec.templateOverride?.(op, tableResource.name, softDelete);
      const code = overridden ?? generateCrudCode(op, tableResource.config.modelConfig, softDelete);
      const fnId = `Crud${pascal(tableResource.name)}${pascal(op)}Fn`;
      const fn = new appsync.AppsyncFunction(built.api, fnId, {
        api: built.api,
        dataSource: ds,
        name: fnId,
        runtime: appsync.FunctionRuntime.JS_1_0_0,
        code: appsync.Code.fromInline(code),
      });

      const { typeName, fieldName } = crudFieldMapping(op, tableResource.name);
      const pipeline: appsync.AppsyncFunction[] = [];
      const stash = spec.stashBeforeFor?.(op, tableResource.name);
      if (stash && Object.keys(stash).length > 0) {
        pipeline.push(
          buildStashFunction(built.api, `StashFn${pascal(tableResource.name)}${pascal(op)}`, stash),
        );
      }
      if (built.authFn) pipeline.push(built.authFn);
      pipeline.push(fn);

      new appsync.Resolver(built.api, `CrudResolver${pascal(tableResource.name)}${pascal(op)}`, {
        api: built.api,
        typeName,
        fieldName,
        pipelineConfig: pipeline,
        runtime: appsync.FunctionRuntime.JS_1_0_0,
        code: PIPELINE_PASSTHROUGH,
      });
    }
  }
}

function buildAuthFunction(api: appsync.GraphqlApi, spec: NonNullable<AppSyncAdapterOptions['authPipeline']>): appsync.AppsyncFunction {
  const code = spec.code ?? (spec.jsFile ? readFileSync(spec.jsFile, 'utf-8') : PASSTHROUGH_AUTH_CODE);
  const noneDS = api.addNoneDataSource('AuthNoneDS');
  return new appsync.AppsyncFunction(api, 'AuthPipelineFn', {
    api,
    dataSource: noneDS,
    name: 'AuthPipelineFn',
    runtime: appsync.FunctionRuntime.JS_1_0_0,
    code: appsync.Code.fromInline(code),
  });
}

function buildStashFunction(
  api: appsync.GraphqlApi,
  id: string,
  stash: Record<string, StashLiteral>,
): appsync.AppsyncFunction {
  const noneDS = api.node.tryFindChild('StashNoneDS')
    ? (api.node.findChild('StashNoneDS') as appsync.NoneDataSource)
    : api.addNoneDataSource('StashNoneDS');
  const entries = Object.entries(stash)
    .map(([k, v]) => `  ctx.stash[${JSON.stringify(k)}] = ${JSON.stringify(v)};`)
    .join('\n');
  const code = `
export function request(ctx) {
${entries}
  return {};
}

export function response(ctx) { return ctx.prev.result; }
`.trim();
  return new appsync.AppsyncFunction(api, id, {
    api,
    dataSource: noneDS,
    name: id,
    runtime: appsync.FunctionRuntime.JS_1_0_0,
    code: appsync.Code.fromInline(code),
  });
}

function buildFunctionFromSource(built: BuiltApi, ctx: RegisterContext, spec: ResolverSpec): appsync.AppsyncFunction {
  if (spec.source.kind === 'lambda') {
    const ds = built.dataSources.lambda.get(spec.source.lambdaName);
    if (!ds) {
      const available = [...built.dataSources.lambda.keys()];
      throw resourceNotFound({
        kind: 'Lambda data source',
        name: spec.source.lambdaName,
        available,
        adapterName: 'appsync',
        hint: available.length === 0
          ? `no Lambda data sources were built — add lambdaAdapter() to adapters[] before appSyncAdapter() so this resolver (${spec.typeName}.${spec.fieldName}) can find its lambda.`
          : `resolver ${spec.typeName}.${spec.fieldName} references "${spec.source.lambdaName}" — rename it to match one of the built lambdas, or create backend/functions/${spec.source.lambdaName}/handler.ts.`,
      });
    }
    return new appsync.AppsyncFunction(built.api, `Fn${spec.typeName}${spec.fieldName}`, {
      api: built.api,
      dataSource: ds,
      name: `Fn${spec.typeName}${spec.fieldName}`,
      runtime: appsync.FunctionRuntime.JS_1_0_0,
      code: appsync.Code.fromInline(LAMBDA_INVOKE_CODE),
    });
  }
  const ds = built.dataSources.dynamodb.get(spec.source.tableName);
  if (!ds) {
    const available = [...built.dataSources.dynamodb.keys()];
    throw resourceNotFound({
      kind: 'DynamoDB data source',
      name: spec.source.tableName,
      available,
      adapterName: 'appsync',
      hint: available.length === 0
        ? `no DynamoDB data sources were built — add dynamoDbAdapter() to adapters[] before appSyncAdapter() so this resolver (${spec.typeName}.${spec.fieldName}) can find its table.`
        : `resolver ${spec.typeName}.${spec.fieldName} references "${spec.source.tableName}" — rename it to match one of the built tables, or add backend/models/${spec.source.tableName}.model.ts.`,
    });
  }
  const code = readFileSync(resolve(ctx.config.rootDir, spec.source.jsFile), 'utf-8');
  return new appsync.AppsyncFunction(built.api, `Fn${spec.typeName}${spec.fieldName}`, {
    api: built.api,
    dataSource: ds,
    name: `Fn${spec.typeName}${spec.fieldName}`,
    runtime: appsync.FunctionRuntime.JS_1_0_0,
    code: appsync.Code.fromInline(code),
  });
}

function toAuthMode(mode: AuthorizationMode): appsync.AuthorizationMode {
  switch (mode.kind) {
    case 'iam':
      return { authorizationType: appsync.AuthorizationType.IAM };
    case 'api-key':
      return {
        authorizationType: appsync.AuthorizationType.API_KEY,
        apiKeyConfig: { expires: Expiration.after(Duration.days(365)) },
      };
    case 'cognito':
      throw new SimpleCdkError({
        code: 'USER_INPUT',
        message: 'Cognito authorization on appSyncAdapter({ authorization }) is not supported via the kind discriminator.',
        hint: 'use { kind: "iam" } or { kind: "api-key" } here. For Cognito-backed auth, add a small wiring adapter that calls getUserPool(ctx) and passes it into the AppSync API authorization config yourself.',
      });
  }
}

function crudFieldMapping(op: string, modelName: string): { typeName: string; fieldName: string } {
  const cap = pascal(modelName);
  switch (op) {
    case 'get':
      return { typeName: 'Query', fieldName: `get${cap}` };
    case 'list':
      return { typeName: 'Query', fieldName: `list${cap}s` };
    case 'create':
      return { typeName: 'Mutation', fieldName: `create${cap}` };
    case 'update':
      return { typeName: 'Mutation', fieldName: `update${cap}` };
    case 'delete':
      return { typeName: 'Mutation', fieldName: `delete${cap}` };
    default:
      throw new Error(`Unknown CRUD op: ${op}`);
  }
}

function pascal(s: string): string {
  return s
    .split(/[-_/\s]+/)
    .filter(Boolean)
    .map((p) => p[0]!.toUpperCase() + p.slice(1))
    .join('');
}

const PIPELINE_PASSTHROUGH = appsync.Code.fromInline(`
export function request(ctx) { return {}; }
export function response(ctx) { return ctx.prev.result; }
`.trim());

const LAMBDA_INVOKE_CODE = `
import { util } from '@aws-appsync/utils';

export function request(ctx) {
  return {
    operation: 'Invoke',
    payload: {
      arguments: ctx.args,
      identity: ctx.identity,
      source: ctx.source,
      info: { fieldName: ctx.info.fieldName, parentTypeName: ctx.info.parentTypeName },
      stash: ctx.stash,
    },
  };
}

export function response(ctx) {
  if (ctx.error) util.error(ctx.error.message, ctx.error.type);
  return ctx.result;
}
`.trim();
