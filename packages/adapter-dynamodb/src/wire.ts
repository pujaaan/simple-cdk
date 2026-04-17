import { Duration, aws_lambda as lambda, aws_lambda_event_sources as sources } from 'aws-cdk-lib';
import type { WireContext } from '@simple-cdk/core';
import type { DynamoDbResource, StreamTargetOptions } from './types.js';

/**
 * For each table with `streamTargets`, attach a `DynamoEventSource` to
 * every named Lambda. The consumer lambda must have already been registered
 * by the lambda adapter — we look it up by `resourcesOf('lambda')` and
 * expect `config.construct` to be set.
 */
export function wireStreamTargets(ctx: WireContext): void {
  const tables = ctx.resourcesOf('dynamodb') as DynamoDbResource[];
  const lambdas = ctx.resourcesOf('lambda') as LambdaLike[];

  for (const table of tables) {
    const cfg = table.config.modelConfig;
    const targets = cfg.streamTargets ?? [];
    if (targets.length === 0) continue;
    if (!table.config.construct) continue;

    for (const name of targets) {
      const match = lambdas.find((l) => l.name === name);
      if (!match) {
        throw new Error(
          `DynamoDB table "${table.name}" declares streamTarget "${name}", but no Lambda with that name was discovered.`,
        );
      }
      const fn = match.config.construct;
      if (!fn) {
        throw new Error(
          `DynamoDB table "${table.name}" streamTarget "${name}" was discovered but not registered — check lambda adapter order.`,
        );
      }
      fn.addEventSource(new sources.DynamoEventSource(table.config.construct, toSourceProps(cfg.streamTargetOptions)));
    }
  }
}

interface LambdaLike {
  name: string;
  config: { construct?: lambda.IFunction };
}

function toSourceProps(opts: StreamTargetOptions | undefined): sources.DynamoEventSourceProps {
  const startingPosition =
    opts?.startingPosition === 'LATEST' ? lambda.StartingPosition.LATEST : lambda.StartingPosition.TRIM_HORIZON;
  return {
    startingPosition,
    batchSize: opts?.batchSize,
    maxBatchingWindow:
      opts?.maxBatchingWindowSeconds !== undefined
        ? Duration.seconds(opts.maxBatchingWindowSeconds)
        : undefined,
    retryAttempts: opts?.retryAttempts,
    parallelizationFactor: opts?.parallelizationFactor,
    bisectBatchOnError: opts?.bisectBatchOnError,
    reportBatchItemFailures: opts?.reportBatchItemFailures,
  };
}
