import type { Adapter, WireContext } from '@simple-cdk/core';
import type { aws_lambda_nodejs } from 'aws-cdk-lib';
import { discoverLambdas } from './discover.js';
import { registerLambdas } from './register.js';
import type { LambdaAdapterOptions, LambdaResource } from './types.js';

export type { LambdaAdapterOptions, LambdaFunctionConfig, LambdaResource } from './types.js';

/**
 * The default Lambda adapter. Discovers handler files under `dir`,
 * loads sibling configs, and registers `NodejsFunction` constructs.
 */
export function lambdaAdapter(opts: LambdaAdapterOptions = {}): Adapter {
  const dir = opts.dir ?? 'backend/functions';
  return {
    name: 'lambda',
    discover: async (ctx) => discoverLambdas(ctx.rootDir, dir),
    register: (ctx) => registerLambdas(ctx, opts),
  };
}

/**
 * Look up a registered Lambda by name from another adapter's wire phase.
 * Throws if the function wasn't discovered or registered yet.
 */
export function getLambdaFunction(
  ctx: Pick<WireContext, 'resourcesOf'>,
  name: string,
): aws_lambda_nodejs.NodejsFunction {
  const resource = ctx.resourcesOf('lambda').find((r) => r.name === name) as LambdaResource | undefined;
  if (!resource) {
    throw new Error(`Lambda "${name}" was not discovered. Check the function folder name.`);
  }
  if (!resource.config.construct) {
    throw new Error(`Lambda "${name}" was discovered but not yet registered. Did the lambda adapter run?`);
  }
  return resource.config.construct;
}
