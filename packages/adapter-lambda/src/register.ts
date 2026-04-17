import { Duration } from 'aws-cdk-lib';
import { aws_lambda as lambda, aws_lambda_nodejs as lambdaNode, aws_logs as logs } from 'aws-cdk-lib';
import type { RegisterContext } from '@simple-cdk/core';
import type { LambdaAdapterOptions, LambdaResource } from './types.js';

const RUNTIMES: Record<NonNullable<LambdaResource['config']['functionConfig']['runtime']>, lambda.Runtime> = {
  'nodejs18.x': lambda.Runtime.NODEJS_18_X,
  'nodejs20.x': lambda.Runtime.NODEJS_20_X,
  'nodejs22.x': lambda.Runtime.NODEJS_22_X,
};

export function registerLambdas(ctx: RegisterContext, opts: LambdaAdapterOptions): void {
  const stackName = opts.stackName ?? 'lambda';
  const defaultMem = opts.defaultMemoryMb ?? 256;
  const defaultTimeout = opts.defaultTimeoutSeconds ?? 30;

  for (const resource of ctx.resources as LambdaResource[]) {
    const fc = resource.config.functionConfig;
    const stack = fc.stack
      ? ctx.stack(fc.stack)
      : opts.stack ?? ctx.stack(stackName, opts.stackId ? { id: opts.stackId } : undefined);
    const id = fc.constructId ?? pascal(resource.name) + 'Function';

    const fn = new lambdaNode.NodejsFunction(stack, id, {
      entry: resource.config.handlerFile,
      handler: 'handler',
      runtime: RUNTIMES[fc.runtime ?? 'nodejs20.x'],
      memorySize: fc.memoryMb ?? defaultMem,
      timeout: Duration.seconds(fc.timeoutSeconds ?? defaultTimeout),
      description: fc.description ?? `${resource.name} (${ctx.config.app}-${ctx.config.stage})`,
      environment: {
        STAGE: ctx.config.stage,
        APP: ctx.config.app,
        ...(ctx.config.stageConfig.env ?? {}),
        ...(fc.environment ?? {}),
      },
      logRetention: logRetentionFromDays(ctx.config.stageConfig.logRetentionDays),
      bundling: {
        minify: ctx.config.stage !== 'dev',
        sourceMap: true,
        target: 'node20',
        nodeModules: fc.nodeModules,
      },
    });

    for (const policy of fc.iamPolicies ?? []) {
      fn.addToRolePolicy(policy);
    }

    resource.config.construct = fn;
  }
}

function logRetentionFromDays(days: number | undefined): logs.RetentionDays | undefined {
  if (!days) return undefined;
  const map: Record<number, logs.RetentionDays> = {
    1: logs.RetentionDays.ONE_DAY,
    3: logs.RetentionDays.THREE_DAYS,
    7: logs.RetentionDays.ONE_WEEK,
    14: logs.RetentionDays.TWO_WEEKS,
    30: logs.RetentionDays.ONE_MONTH,
    60: logs.RetentionDays.TWO_MONTHS,
    90: logs.RetentionDays.THREE_MONTHS,
    180: logs.RetentionDays.SIX_MONTHS,
    365: logs.RetentionDays.ONE_YEAR,
    730: logs.RetentionDays.TWO_YEARS,
  };
  return map[days];
}

function pascal(s: string): string {
  return s
    .split(/[-_/\s]+/)
    .filter(Boolean)
    .map((p) => p[0]!.toUpperCase() + p.slice(1))
    .join('');
}
