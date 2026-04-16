/**
 * Pluggable auth pipeline. Provide either a JS file containing
 * `request` and `response` exports, or inline source code that does the
 * same. The function runs as the first step of every resolver pipeline.
 *
 * Skip the pipeline entirely with `bypassAuth: true` on a resolver, or
 * by omitting `authPipeline` from the adapter options.
 */
export interface AuthPipelineSpec {
  jsFile?: string;
  code?: string;
}

export type CrudOperation = 'get' | 'list' | 'create' | 'update' | 'delete';

export interface CrudGenSpec {
  /** Models to auto-generate CRUD for. Use 'all' or a list of model names. */
  models?: 'all' | string[];
  /** Operations to generate. Default: all five. */
  operations?: CrudOperation[];
  /** Soft-delete instead of removing the row (sets deletedAt timestamp). */
  softDelete?: boolean;
}

/**
 * Manual resolver registration. Use this for any field where the
 * auto-CRUD generator doesn't fit — custom queries, mutations,
 * complex business logic.
 */
export interface ResolverSpec {
  typeName: string;
  fieldName: string;
  source: ResolverSource;
  /** Skip the auth pipeline. Default: false. */
  bypassAuth?: boolean;
}

export type ResolverSource =
  | { kind: 'lambda'; lambdaName: string }
  | { kind: 'dynamodb'; tableName: string; jsFile: string };

export interface AppSyncAdapterOptions {
  /** Path to the GraphQL schema file. Required. */
  schemaFile: string;
  /** API name suffix. Default: 'api'. Full name: '<app>-<stage>-<suffix>'. */
  apiName?: string;
  /** Stack to register the API under. Default: 'api'. */
  stackName?: string;
  /** Pluggable auth pipeline applied to all non-bypass resolvers. */
  authPipeline?: AuthPipelineSpec;
  /** Auto-generate CRUD resolvers from discovered DynamoDB models. */
  generateCrud?: CrudGenSpec;
  /** Manual resolver wiring. */
  resolvers?: ResolverSpec[];
  /** Authorization mode for the API. Default: API_KEY (development only). */
  authorization?: AuthorizationMode;
}

export type AuthorizationMode =
  | { kind: 'api-key' }
  | { kind: 'iam' }
  | { kind: 'cognito'; userPoolName: string };
