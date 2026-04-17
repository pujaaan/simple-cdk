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

/**
 * Literal value types that can be seeded into `ctx.stash` before the auth
 * pipeline runs. JSON-encoded into the emitted resolver function, so keep
 * to JSON-safe values. Use `{ code: '...' }` to emit a dynamic expression.
 */
export type StashLiteral = string | number | boolean | null | StashLiteral[] | { [key: string]: StashLiteral };

/**
 * Dynamic stash value — the `code` string is emitted **verbatim** as a
 * resolver-side expression, not JSON-encoded. Use to seed values that
 * depend on the request:
 *
 *   stashBefore: { tenantId: { code: 'ctx.identity.claims["custom:tenantId"]' } }
 *
 * Emits: `ctx.stash.tenantId = ctx.identity.claims["custom:tenantId"];`
 */
export interface StashCode {
  code: string;
}

/** A seeded stash value — either a JSON-safe literal or a `{ code }` expression. */
export type StashValue = StashLiteral | StashCode;

export interface CrudGenSpec {
  /** Models to auto-generate CRUD for. Use 'all' or a list of model names. */
  models?: 'all' | string[];
  /** Operations to generate. Default: all five. */
  operations?: CrudOperation[];
  /** Soft-delete instead of removing the row (sets deletedAt timestamp). */
  softDelete?: boolean;
  /**
   * Per-(op, model) metadata seeded into `ctx.stash` before the auth
   * function runs. Return `undefined` to skip seeding for that pairing.
   *
   * Values may be literals (JSON-encoded) or `{ code: '...' }` (emitted
   * verbatim as a resolver-side expression). Typical use: tag generated
   * resolvers with their operation type, model name, or required roles for
   * a centralized auth function to read — and pull per-request values like
   * `tenantId` or `userId` out of `ctx.identity` for tenant-scoping.
   *
   *   stashBeforeFor: () => ({
   *     tenantId: { code: 'ctx.identity.claims["custom:tenantId"]' },
   *     userId:   { code: 'ctx.identity.sub' },
   *   })
   */
  stashBeforeFor?: (op: CrudOperation, modelName: string) => Record<string, StashValue> | undefined;
  /**
   * Raw resolver-side code inserted before the stash-seed block, on every
   * generated CRUD stash function. Use for multi-statement preambles that
   * don't fit the `stashBeforeFor` key/value shape (e.g. parsing a JWT,
   * deriving a composite key). Return `undefined` to skip.
   *
   *   stashCodeFor: () => `
   *     const claims = ctx.identity.claims ?? {};
   *     if (!claims["custom:tenantId"]) util.unauthorized();
   *   `
   */
  stashCodeFor?: (op: CrudOperation, modelName: string) => string | undefined;
  /**
   * Override the generated resolver code on a per-(op, model) basis. Return
   * a string to use as the AppsyncFunction code; return `null`/`undefined`
   * to fall back to the built-in template. Useful for projects that need
   * tenant-isolation, GSI-based lists, or custom projection logic without
   * forking the adapter.
   */
  templateOverride?: (
    op: CrudOperation,
    modelName: string,
    softDelete: boolean,
  ) => string | null | undefined;
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
  /**
   * Metadata seeded into `ctx.stash` before the auth function runs.
   * Values may be literals (JSON-encoded) or `{ code: '...' }` expressions
   * (emitted verbatim). Use the latter to pull per-request values out of
   * `ctx.identity` / `ctx.args` for tenant-scoping or similar.
   */
  stashBefore?: Record<string, StashValue>;
  /**
   * Raw resolver-side JS inserted before the stash-seed block. Use for
   * multi-statement preambles (parsing a JWT claim, computing a composite
   * key, early-returning an unauthorized). Runs on the same JS runtime
   * AppSync uses (`@aws-appsync/utils` is in scope via `util`).
   */
  stashCode?: string;
}

export type ResolverSource =
  | { kind: 'lambda'; lambdaName: string }
  | { kind: 'dynamodb'; tableName: string; jsFile: string };

import type { Stack } from 'aws-cdk-lib';

export interface AppSyncAdapterOptions {
  /** Path to the GraphQL schema file. Required. */
  schemaFile: string;
  /**
   * AppSync API name (the AWS resource name, not the CF logical ID).
   * Default: `${app}-${stage}-api`. Set verbatim when adopting an existing
   * deployed API — CloudFormation treats name changes as replace.
   */
  apiName?: string;
  /**
   * Pin the CloudFormation logical ID for the GraphqlApi. Use when adopting
   * simple-cdk over an existing stack whose API was created under a
   * different logical ID. Default: `'Api'`.
   */
  apiConstructId?: string;
  /** Stack to register the API under. Default: 'api'. */
  stackName?: string;
  /**
   * Pin the CloudFormation logical ID of the stack verbatim, skipping
   * the `<app>-<stage>-` prefix. Use when adopting an existing stack.
   */
  stackId?: string;
  /**
   * Register the API under a consumer-created Stack instead of letting
   * the engine create one. Takes precedence over `stackName` / `stackId`.
   */
  stack?: Stack;
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
