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
 * pipeline runs. Keep to JSON primitives — anything that needs dynamic
 * resolution should be set inside the auth function itself.
 */
export type StashLiteral = string | number | boolean;

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
   * Typical use: tag generated resolvers with their operation type, model
   * name, or required roles for a centralized auth function to read.
   */
  stashBeforeFor?: (op: CrudOperation, modelName: string) => Record<string, StashLiteral> | undefined;
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
   * Intended for static operation metadata (operation type, allowed roles,
   * a field path to the tenant id) that a central auth function reads.
   */
  stashBefore?: Record<string, StashLiteral>;
}

export type ResolverSource =
  | { kind: 'lambda'; lambdaName: string }
  | { kind: 'dynamodb'; tableName: string; jsFile: string };

import type { Stack } from 'aws-cdk-lib';

export interface AppSyncAdapterOptions {
  /** Path to the GraphQL schema file. Required. */
  schemaFile: string;
  /** API name suffix. Default: 'api'. Full name: '<app>-<stage>-<suffix>'. */
  apiName?: string;
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
