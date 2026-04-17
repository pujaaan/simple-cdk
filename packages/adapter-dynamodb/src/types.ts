import type { Resource } from '@simple-cdk/core';
import type { aws_dynamodb, Stack } from 'aws-cdk-lib';

export type AttrType = 'string' | 'number' | 'binary';

export interface KeyDef {
  name: string;
  type?: AttrType;
}

export interface GsiConfig {
  name: string;
  pk: KeyDef;
  sk?: KeyDef;
  /** Default: 'ALL'. Pass `{ include: [...] }` for INCLUDE projection. */
  projection?: 'ALL' | 'KEYS_ONLY' | { include: string[] };
}

export type StreamMode = 'KEYS_ONLY' | 'NEW_IMAGE' | 'OLD_IMAGE' | 'NEW_AND_OLD_IMAGES';

/**
 * Subset of `DynamoEventSourceProps` surfaced via the model config. Omitted
 * options can be configured by the consumer directly on the Lambda construct
 * if needed — these are the knobs people reach for most often.
 */
export interface StreamTargetOptions {
  /** Where to start reading. Default: 'TRIM_HORIZON'. */
  startingPosition?: 'TRIM_HORIZON' | 'LATEST';
  /** Max records per batch. Default: 100. */
  batchSize?: number;
  /** Max seconds to buffer before invoking the consumer. */
  maxBatchingWindowSeconds?: number;
  /** Max retry attempts before sending to DLQ / discarding. Default: -1 (infinite). */
  retryAttempts?: number;
  /** Number of batches to process concurrently. Default: 1. */
  parallelizationFactor?: number;
  /** Split on error. Default: false. */
  bisectBatchOnError?: boolean;
  /** Report partial batch failures. Default: false. */
  reportBatchItemFailures?: boolean;
}

/**
 * Generic DynamoDB model config — no domain assumptions.
 * Consumers can extend this type for their own model files.
 */
export interface DynamoDbModelConfig {
  /** Table id; defaults to model file stem. */
  name?: string;
  /**
   * Pin the CloudFormation logical ID for this table. Use when adopting
   * simple-cdk over an existing stack, or after renaming a model, to avoid
   * CloudFormation treating the rename as delete-and-recreate (data loss).
   * Defaults to `${PascalCase(name)}Table`.
   */
  constructId?: string;
  pk: KeyDef;
  sk?: KeyDef;
  gsis?: GsiConfig[];
  stream?: StreamMode;
  /**
   * Names of Lambda functions (as discovered by the lambda adapter) that
   * should consume this table's stream. If set and `stream` is omitted,
   * the stream defaults to `NEW_AND_OLD_IMAGES`. Each consumer is wired
   * in the dynamodb adapter's wire phase via `DynamoEventSource`.
   */
  streamTargets?: string[];
  /** EventSourceMapping options applied to every `streamTargets` consumer. */
  streamTargetOptions?: StreamTargetOptions;
  ttlAttribute?: string;
  billingMode?: 'PAY_PER_REQUEST' | 'PROVISIONED';
  pointInTimeRecovery?: boolean;
  stack?: string;
}

export interface DynamoDbResourceConfig {
  modelConfig: DynamoDbModelConfig;
  sourceFile: string;
  construct?: aws_dynamodb.Table;
}

export type DynamoDbResource = Resource<DynamoDbResourceConfig> & { type: 'dynamodb-table' };

export interface DynamoDbAdapterOptions {
  /** Where to look for model files. Default: 'backend/models'. */
  dir?: string;
  /** Model file suffix(es) to match. Default: ['.model.ts', '.model.js']. */
  match?: string[];
  /** Stack name to register tables under. Default: 'data'. */
  stackName?: string;
  /**
   * Pin the CloudFormation logical ID of the stack verbatim, skipping
   * the `<app>-<stage>-` prefix. Use when adopting an existing stack.
   */
  stackId?: string;
  /**
   * Register tables under a consumer-created Stack instead of letting
   * the engine create one. Takes precedence over `stackName` / `stackId`.
   * Per-model `stack?` still overrides this.
   */
  stack?: Stack;
}
