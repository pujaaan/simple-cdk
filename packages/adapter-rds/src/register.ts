import {
  aws_ec2 as ec2,
  aws_rds as rds,
  Duration,
  RemovalPolicy,
} from 'aws-cdk-lib';
import type { RegisterContext } from '@simple-cdk/core';
import type { BuiltRds, RdsAdapterOptions } from './types.js';

const cache = new WeakMap<RegisterContext['app'], BuiltRds>();

export function getBuiltRds(ctx: { app: RegisterContext['app'] }): BuiltRds | undefined {
  return cache.get(ctx.app);
}

export function registerRdsInstance(ctx: RegisterContext, opts: RdsAdapterOptions): BuiltRds {
  const stack = opts.stack ?? ctx.stack(opts.stackName ?? 'data', opts.stackId ? { id: opts.stackId } : undefined);
  const removal = removalPolicyFromStage(ctx.config.stageConfig.removalPolicy);

  const vpc =
    opts.vpc ??
    new ec2.Vpc(stack, 'DbVpc', {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        { name: 'Isolated', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    });

  const securityGroup =
    opts.securityGroup ??
    new ec2.SecurityGroup(stack, 'DbSecurityGroup', {
      vpc,
      description: `${ctx.config.app}-${ctx.config.stage} RDS access`,
      allowAllOutbound: true,
    });

  const isProd = ctx.config.stage === 'prod';
  const databaseName = opts.databaseName ?? sanitizeDbName(ctx.config.app);

  const credentials =
    opts.credentials ??
    rds.Credentials.fromGeneratedSecret('admin', {
      secretName: opts.secretName ?? `${ctx.config.app}-${ctx.config.stage}-db`,
    });

  const instance = new rds.DatabaseInstance(stack, opts.instanceConstructId ?? 'DbInstance', {
    engine: toEngine(opts),
    vpc,
    vpcSubnets: { subnetType: opts.publiclyAccessible ? ec2.SubnetType.PUBLIC : ec2.SubnetType.PRIVATE_ISOLATED },
    publiclyAccessible: opts.publiclyAccessible ?? false,
    instanceType: toInstanceType(opts.instanceClass ?? 't4g.micro'),
    allocatedStorage: opts.allocatedStorageGb ?? 20,
    maxAllocatedStorage: opts.maxAllocatedStorageGb,
    storageType: opts.storageType,
    credentials,
    instanceIdentifier: opts.instanceIdentifier,
    databaseName,
    securityGroups: [securityGroup],
    backupRetention: Duration.days(opts.backupRetentionDays ?? (isProd ? 14 : 7)),
    deletionProtection: opts.deletionProtection ?? (removal === RemovalPolicy.RETAIN),
    removalPolicy: removal,
    storageEncrypted: opts.storageEncrypted ?? true,
  });

  const secret = instance.secret;
  const built: BuiltRds = { instance, secret, vpc, securityGroup };
  cache.set(ctx.app, built);
  return built;
}

function toEngine(opts: RdsAdapterOptions): rds.IInstanceEngine {
  if (opts.engine === 'postgres') {
    return rds.DatabaseInstanceEngine.postgres({
      version: opts.engineVersion
        ? rds.PostgresEngineVersion.of(opts.engineVersion, opts.engineVersion.split('.')[0]!)
        : rds.PostgresEngineVersion.VER_16_4,
    });
  }
  return rds.DatabaseInstanceEngine.mysql({
    version: opts.engineVersion
      ? rds.MysqlEngineVersion.of(opts.engineVersion, opts.engineVersion.split('.')[0]!)
      : rds.MysqlEngineVersion.VER_8_0,
  });
}

function toInstanceType(cls: string): ec2.InstanceType {
  return new ec2.InstanceType(cls);
}

function removalPolicyFromStage(value: string | undefined): RemovalPolicy | undefined {
  switch (value) {
    case 'destroy':
      return RemovalPolicy.DESTROY;
    case 'retain':
      return RemovalPolicy.RETAIN;
    case 'snapshot':
      return RemovalPolicy.SNAPSHOT;
    default:
      return undefined;
  }
}

function sanitizeDbName(app: string): string {
  return app.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^_+|_+$/g, '') || 'app';
}
