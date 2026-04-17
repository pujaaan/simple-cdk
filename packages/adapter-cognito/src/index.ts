import { adapterNotRun, requireResource, type Adapter, type WireContext } from '@simple-cdk/core';
import type { aws_cognito, aws_lambda_nodejs } from 'aws-cdk-lib';
import { discoverTriggers } from './discover.js';
import { getBuiltCognito, registerUserPool, type BuiltCognito } from './register.js';
import type { CognitoAdapterOptions, TriggerName } from './types.js';

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
    discover: (ctx) => discoverTriggers(ctx.rootDir, triggersDir, ctx.report),
    register: (ctx) => {
      registerUserPool(ctx, opts);
    },
  };
}

function requireBuilt(ctx: Pick<WireContext, 'app'>, kind: string): BuiltCognito {
  const built = getBuiltCognito(ctx);
  if (!built) {
    throw adapterNotRun({ adapterName: 'cognito', kind, adapterCall: 'cognitoAdapter()' });
  }
  return built;
}

/** Look up the registered user pool from another adapter's wire phase. */
export function getUserPool(ctx: Pick<WireContext, 'app'>): aws_cognito.UserPool {
  return requireBuilt(ctx, 'Cognito user pool').userPool;
}

/** Look up the registered web client from another adapter's wire phase. */
export function getUserPoolClient(ctx: Pick<WireContext, 'app'>): aws_cognito.UserPoolClient {
  return requireBuilt(ctx, 'Cognito user pool client').client;
}

/**
 * Look up a registered Cognito trigger Lambda by name. Enables cross-adapter
 * wiring — grant a trigger extra IAM permissions, set env vars from DynamoDB
 * tables, etc. Throws if the trigger wasn't discovered.
 */
export function getCognitoTrigger(
  ctx: Pick<WireContext, 'app'>,
  name: TriggerName,
): aws_lambda_nodejs.NodejsFunction {
  const built = requireBuilt(ctx, 'Cognito trigger');
  return requireResource(built.triggers.get(name), {
    kind: 'Cognito trigger',
    name,
    available: [...built.triggers.keys()],
    adapterName: 'cognito',
    hint: `create backend/triggers/${name}/handler.ts (or set triggersDir on cognitoAdapter() if your layout differs).`,
  });
}
