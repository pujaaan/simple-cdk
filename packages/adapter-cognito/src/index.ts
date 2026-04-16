import type { Adapter, WireContext } from '@simple-cdk/core';
import type { aws_cognito } from 'aws-cdk-lib';
import { discoverTriggers } from './discover.js';
import { getBuiltCognito, registerUserPool } from './register.js';
import type { CognitoAdapterOptions } from './types.js';

export type { CognitoAdapterOptions, TriggerName, TriggerResource } from './types.js';

/**
 * The default Cognito adapter. Discovers Lambda triggers under
 * `triggersDir` (each subfolder is a trigger named after a known Cognito
 * operation) and creates a user pool + app client.
 */
export function cognitoAdapter(opts: CognitoAdapterOptions = {}): Adapter {
  const triggersDir = opts.triggersDir ?? 'backend/triggers';
  return {
    name: 'cognito',
    discover: (ctx) => discoverTriggers(ctx.rootDir, triggersDir),
    register: (ctx) => {
      registerUserPool(ctx, opts);
    },
  };
}

/** Look up the registered user pool from another adapter's wire phase. */
export function getUserPool(ctx: Pick<WireContext, 'app'>): aws_cognito.UserPool {
  const built = getBuiltCognito(ctx);
  if (!built) {
    throw new Error('Cognito user pool not built — did the cognito adapter run?');
  }
  return built.userPool;
}

/** Look up the registered web client from another adapter's wire phase. */
export function getUserPoolClient(ctx: Pick<WireContext, 'app'>): aws_cognito.UserPoolClient {
  const built = getBuiltCognito(ctx);
  if (!built) {
    throw new Error('Cognito client not built — did the cognito adapter run?');
  }
  return built.client;
}
