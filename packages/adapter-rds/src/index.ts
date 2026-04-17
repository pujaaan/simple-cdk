import type { Adapter, WireContext } from '@simple-cdk/core';
import type { aws_ec2, aws_rds, aws_secretsmanager } from 'aws-cdk-lib';
import { getBuiltRds, registerRdsInstance } from './register.js';
import type { RdsAdapterOptions } from './types.js';

export type { BuiltRds, RdsAdapterOptions, RdsEngineKind } from './types.js';

/**
 * The default RDS adapter. Provisions a single-instance RDS database
 * (Postgres or MySQL), a VPC (isolated subnets by default), and a
 * Secrets Manager secret holding the master credentials.
 *
 * The adapter does no automatic IAM or network wiring with other adapters.
 * Consumers grant their Lambdas access by calling `getRdsInstance(ctx)`
 * and wiring `fn.connections.allowDefaultPortFrom(...)` themselves —
 * this matches the library's "no surprise permissions" posture.
 */
export function rdsAdapter(opts: RdsAdapterOptions): Adapter {
  return {
    name: 'rds',
    register: (ctx) => {
      registerRdsInstance(ctx, opts);
    },
  };
}

export function getRdsInstance(ctx: Pick<WireContext, 'app'>): aws_rds.DatabaseInstance {
  const built = getBuiltRds(ctx);
  if (!built) throw new Error('RDS not built — did the rds adapter run?');
  return built.instance;
}

export function getRdsSecret(ctx: Pick<WireContext, 'app'>): aws_secretsmanager.ISecret {
  const built = getBuiltRds(ctx);
  if (!built) throw new Error('RDS not built — did the rds adapter run?');
  return built.secret;
}

export function getRdsVpc(ctx: Pick<WireContext, 'app'>): aws_ec2.IVpc {
  const built = getBuiltRds(ctx);
  if (!built) throw new Error('RDS not built — did the rds adapter run?');
  return built.vpc;
}

export function getRdsSecurityGroup(ctx: Pick<WireContext, 'app'>): aws_ec2.ISecurityGroup {
  const built = getBuiltRds(ctx);
  if (!built) throw new Error('RDS not built — did the rds adapter run?');
  return built.securityGroup;
}
