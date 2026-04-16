import type { Resource } from '@simple-cdk/core';
import type { aws_dynamodb } from 'aws-cdk-lib';

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
 * Generic DynamoDB model config — no domain assumptions.
 * Consumers can extend this type for their own model files.
 */
export interface DynamoDbModelConfig {
  /** Table id; defaults to model file stem. */
  name?: string;
  pk: KeyDef;
  sk?: KeyDef;
  gsis?: GsiConfig[];
  stream?: StreamMode;
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
}
