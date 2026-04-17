import { adapterOrderError, requireResource, type Adapter, type WireContext } from '@simple-cdk/core';
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
    discover: async (ctx) => discoverLambdas(ctx.rootDir, dir, ctx.report),
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
  const all = ctx.resourcesOf('lambda') as LambdaResource[];
  const resource = requireResource(
    all.find((r) => r.name === name),
    {
      kind: 'Lambda',
      name,
      available: all.map((r) => r.name),
      adapterName: 'lambda',
      hint: all.length === 0
        ? `no Lambdas were discovered — ensure lambdaAdapter() is in your adapters array and backend/functions/${name}/handler.ts exists.`
        : `create backend/functions/${name}/handler.ts (or set lambdaAdapter({ dir }) if your layout differs).`,
    },
  );
  if (!resource.config.construct) {
    throw adapterOrderError({ adapterName: 'lambda', kind: `Lambda "${name}"` });
  }
  return resource.config.construct;
}
