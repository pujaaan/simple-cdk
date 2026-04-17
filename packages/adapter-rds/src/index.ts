import { adapterNotRun, SimpleCdkError, type Adapter, type WireContext } from '@simple-cdk/core';
import type { aws_ec2, aws_rds, aws_secretsmanager } from 'aws-cdk-lib';
import { getBuiltRds, registerRdsInstance } from './register.js';
import type { BuiltRds, RdsAdapterOptions } from './types.js';

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

function requireBuilt(ctx: Pick<WireContext, 'app'>, kind: string): BuiltRds {
  const built = getBuiltRds(ctx);
  if (!built) {
    throw adapterNotRun({ adapterName: 'rds', kind, adapterCall: 'rdsAdapter({ engine: "postgres" })' });
  }
  return built;
}

export function getRdsInstance(ctx: Pick<WireContext, 'app'>): aws_rds.DatabaseInstance {
  return requireBuilt(ctx, 'RDS instance').instance;
}

export function getRdsSecret(ctx: Pick<WireContext, 'app'>): aws_secretsmanager.ISecret {
  const built = requireBuilt(ctx, 'RDS credentials secret');
  if (!built.secret) {
    throw new SimpleCdkError({
      code: 'USER_INPUT',
      message: 'RDS adapter has no managed secret — credentials were supplied via `fromPassword`.',
      hint: 'access the password directly from the `credentials` option you passed to rdsAdapter(), or switch to `rds.Credentials.fromGeneratedSecret(...)` to get a managed secret back.',
    });
  }
  return built.secret;
}

export function getRdsVpc(ctx: Pick<WireContext, 'app'>): aws_ec2.IVpc {
  return requireBuilt(ctx, 'RDS VPC').vpc;
}

export function getRdsSecurityGroup(ctx: Pick<WireContext, 'app'>): aws_ec2.ISecurityGroup {
  return requireBuilt(ctx, 'RDS security group').securityGroup;
}
