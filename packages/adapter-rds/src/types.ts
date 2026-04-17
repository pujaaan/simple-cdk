import type { aws_ec2, aws_rds, aws_secretsmanager, Stack } from 'aws-cdk-lib';

export type RdsEngineKind = 'postgres' | 'mysql';

export interface RdsAdapterOptions {
  /** Database engine. Required. */
  engine: RdsEngineKind;
  /**
   * Engine version escape hatch, e.g. '16.4' for Postgres. If omitted, the
   * adapter picks the CDK default (tracks current latest supported).
   */
  engineVersion?: string;
  /** Database name created at provision time. Default: app name (underscored). */
  databaseName?: string;
  /** Instance class, e.g. 't4g.micro', 't4g.small'. Default: 't4g.micro'. */
  instanceClass?: string;
  /** Allocated storage in GB. Default: 20. */
  allocatedStorageGb?: number;
  /** Enable multi-AZ. Default: false. */
  multiAz?: boolean;
  /** Publicly accessible. Default: false (placed in isolated subnets). */
  publiclyAccessible?: boolean;
  /**
   * Optional existing VPC to place the instance in. If omitted, the adapter
   * creates a new VPC with 2 AZs and isolated subnets (no NAT gateway).
   */
  vpc?: aws_ec2.IVpc;
  /**
   * Optional existing security group for the instance. If omitted, one is
   * created with no ingress — consumer lambdas grant themselves access via
   * `getRdsInstance(ctx).connections.allowDefaultPortFrom(fn)`.
   */
  securityGroup?: aws_ec2.ISecurityGroup;
  /** Secret name suffix. Full name: '<app>-<stage>-<suffix>'. Default: 'db'. */
  secretName?: string;
  /** Stack name to register the instance under. Default: 'data'. */
  stackName?: string;
  /**
   * Pin the CloudFormation logical ID of the stack verbatim, skipping
   * the `<app>-<stage>-` prefix.
   */
  stackId?: string;
  /**
   * Register under a consumer-created Stack instead of letting the engine
   * create one. Takes precedence over `stackName` / `stackId`.
   */
  stack?: Stack;
  /** Pin the CF logical ID of the instance. Default: 'DbInstance'. */
  instanceConstructId?: string;
  /** Backup retention in days. Default: 7 for non-prod, 14 for prod. */
  backupRetentionDays?: number;
  /** Enable deletion protection. Default: matches stage removal policy. */
  deletionProtection?: boolean;
}

export interface BuiltRds {
  instance: aws_rds.DatabaseInstance;
  secret: aws_secretsmanager.ISecret;
  vpc: aws_ec2.IVpc;
  securityGroup: aws_ec2.ISecurityGroup;
}
