import { aws_ssm as ssm, CfnOutput } from 'aws-cdk-lib';
import type { Adapter, WireContext } from '@simple-cdk/core';

/**
 * Values the `collect` callback can return. Tokens (produced by CDK, e.g.
 * `userPool.userPoolId`) are fine — they resolve at synth/deploy time.
 */
export type OutputValue = string | number | boolean;

export interface OutputsAdapterOptions {
  /**
   * Produce the outputs object. Called during the wire phase, so all other
   * adapters have registered. Use `getUserPool(ctx)`, `getAppSyncApi(ctx)`,
   * etc. inside this function to pull values.
   */
  collect: (ctx: WireContext) => Record<string, OutputValue> | Promise<Record<string, OutputValue>>;
  /**
   * SSM parameter name. Default: `/<app>/<stage>/outputs`. Stored as a
   * single `String` parameter holding a JSON-stringified object so
   * frontends can fetch it in one call.
   */
  parameterName?: string;
  /**
   * Also emit each key as a `CfnOutput` on the hosting stack. Default: true.
   * Disable if you only want the SSM parameter.
   */
  cfnOutputs?: boolean;
  /** Stack to register the parameter under. Default: 'outputs'. */
  stackName?: string;
  /**
   * Pin the CloudFormation logical ID of the stack verbatim, skipping
   * the `<app>-<stage>-` prefix.
   */
  stackId?: string;
  /**
   * Pin the CloudFormation logical ID of the SSM parameter construct.
   * Default: `'BundledOutputs'`.
   */
  parameterConstructId?: string;
}

/**
 * Bundles arbitrary stack outputs into a single SSM parameter. Frontends
 * (or any consumer) read one parameter and get the whole config object.
 */
export function outputsAdapter(opts: OutputsAdapterOptions): Adapter {
  return {
    name: 'outputs',
    wire: async (ctx) => {
      const values = await opts.collect(ctx);
      const paramName = opts.parameterName ?? `/${ctx.config.app}/${ctx.config.stage}/outputs`;
      const stack = ctx.stack(opts.stackName ?? 'outputs', opts.stackId ? { id: opts.stackId } : undefined);

      new ssm.StringParameter(stack, opts.parameterConstructId ?? 'BundledOutputs', {
        parameterName: paramName,
        stringValue: JSON.stringify(values),
        description: `Bundled outputs for ${ctx.config.app} (${ctx.config.stage}).`,
        tier: ssm.ParameterTier.STANDARD,
      });

      if (opts.cfnOutputs !== false) {
        for (const [key, value] of Object.entries(values)) {
          new CfnOutput(stack, `Output${pascal(key)}`, {
            value: String(value),
            exportName: `${ctx.config.app}-${ctx.config.stage}-${key}`,
          });
        }
      }
    },
  };
}

function pascal(s: string): string {
  return s
    .split(/[-_/.\s]+/)
    .filter(Boolean)
    .map((p) => p[0]!.toUpperCase() + p.slice(1))
    .join('');
}
