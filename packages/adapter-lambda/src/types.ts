import type { Resource } from '@simple-cdk/core';
import type { aws_iam, aws_lambda_nodejs, Duration, Stack } from 'aws-cdk-lib';

/**
 * Static config a function can export from a sibling `config.ts`.
 * Everything is optional — adapter applies sensible defaults.
 */
export interface LambdaFunctionConfig {
  /** Override the function name. Defaults to the folder name. */
  name?: string;
  /**
   * Pin the CloudFormation logical ID for this function. Use when adopting
   * simple-cdk over an existing stack, or after renaming a handler folder,
   * to avoid CloudFormation treating the rename as delete-and-recreate.
   * Defaults to `${PascalCase(name)}Function`.
   */
  constructId?: string;
  /** Memory in MB. Default: 256. */
  memoryMb?: number;
  /** Timeout in seconds. Default: 30. */
  timeoutSeconds?: number;
  /** Environment variables (literal strings). Stage env is merged in. */
  environment?: Record<string, string>;
  /** Extra IAM policy statements to attach to the role. */
  iamPolicies?: aws_iam.PolicyStatement[];
  /** Extra npm packages esbuild should bundle (added to nodeModules). */
  nodeModules?: string[];
  /** Override the runtime. Default: nodejs20.x. */
  runtime?: 'nodejs20.x' | 'nodejs22.x' | 'nodejs18.x';
  /** Bundle this function into a separate stack. Default: shared 'lambda' stack. */
  stack?: string;
  /** Optional description shown in the AWS console. */
  description?: string;
}

/**
 * Internal shape carried on the resource — includes the discovered files
 * and (after register) the created NodejsFunction construct.
 */
export interface LambdaResourceConfig {
  handlerFile: string;
  configFile?: string;
  functionConfig: LambdaFunctionConfig;
  construct?: aws_lambda_nodejs.NodejsFunction;
  duration?: Duration;
}

export type LambdaResource = Resource<LambdaResourceConfig> & { type: 'lambda' };

export interface LambdaAdapterOptions {
  /**
   * Where to look for handler files. Default: 'backend/functions'.
   * Each subdirectory is treated as one Lambda; expects `handler.ts|.js`
   * and an optional `config.ts|.js`.
   */
  dir?: string;
  /** Default memory size in MB applied when a function omits it. */
  defaultMemoryMb?: number;
  /** Default timeout in seconds applied when a function omits it. */
  defaultTimeoutSeconds?: number;
  /** Stack name to register functions under. Default: 'lambda'. */
  stackName?: string;
  /**
   * Pin the CloudFormation logical ID of the stack verbatim, skipping
   * the `<app>-<stage>-` prefix. Use when adopting an existing stack.
   */
  stackId?: string;
  /**
   * Register functions under a consumer-created Stack instead of letting
   * the engine create one. Takes precedence over `stackName` / `stackId`.
   * Per-function `stack?` still overrides this.
   */
  stack?: Stack;
}
