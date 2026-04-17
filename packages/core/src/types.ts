import type { App, Stack } from 'aws-cdk-lib';

/**
 * A discovered piece of work for an adapter — e.g. one Lambda handler,
 * one DynamoDB model, one Cognito trigger. Adapters define what `config`
 * looks like; the engine treats it as opaque.
 */
export interface Resource<TConfig = unknown> {
  type: string;
  name: string;
  source: string;
  config: TConfig;
}

/**
 * Per-stage settings. Anything truly app-specific (account, region,
 * removal policy, log retention) lives here. The engine ships no defaults
 * for any of these — the consumer chooses.
 */
export interface StageConfig {
  account?: string;
  region: string;
  removalPolicy?: 'destroy' | 'retain' | 'snapshot';
  logRetentionDays?: number;
  tags?: Record<string, string>;
  env?: Record<string, string>;
}

export interface AppConfig {
  app: string;
  stages: Record<string, StageConfig>;
  adapters: Adapter[];
  defaultStage?: string;
  rootDir?: string;
}

export interface ResolvedAppConfig extends AppConfig {
  rootDir: string;
  stage: string;
  stageConfig: StageConfig;
}

export interface DiscoveryContext {
  config: ResolvedAppConfig;
  rootDir: string;
  log: Logger;
}

export interface StackOptions {
  /**
   * Override the CloudFormation logical ID verbatim, skipping the default
   * `<app>-<stage>-<name>` prefix. Use when adopting simple-cdk over an
   * existing CF stack whose id doesn't follow the default shape, or when
   * grouping resources from multiple adapters into one CF stack.
   */
  id?: string;
}

export interface RegisterContext {
  config: ResolvedAppConfig;
  app: App;
  /**
   * Get-or-create a stack by logical name. The engine namespaces it as
   * `<app>-<stage>-<name>` so multiple stages in one repo don't collide.
   * Pass `{ id }` to use a verbatim CF id instead of the default prefix.
   */
  stack(name: string, opts?: StackOptions): Stack;
  /** Resources discovered by this adapter. */
  resources: Resource[];
  /** All resources from all adapters, keyed by adapter name. */
  allResources: Map<string, Resource[]>;
  log: Logger;
}

export interface WireContext extends RegisterContext {
  /** Look up another adapter's resources by adapter name. */
  resourcesOf(adapterName: string): Resource[];
}

/**
 * The contract every adapter implements. All hooks are optional —
 * an adapter can do discovery only, registration only, or any combination.
 */
export interface Adapter {
  /** Stable, unique identifier. Used for resource lookup and overrides. */
  name: string;

  /** Scan the filesystem (or anywhere else) for resources to register. */
  discover?(ctx: DiscoveryContext): Promise<Resource[]> | Resource[];

  /** Create CDK constructs for the discovered resources. */
  register?(ctx: RegisterContext): void | Promise<void>;

  /** Cross-wire with other adapters' resources (runs after all register). */
  wire?(ctx: WireContext): void | Promise<void>;

  /** Optional CLI commands this adapter contributes. */
  commands?(): Command[];
}

export interface Command {
  name: string;
  description: string;
  run(args: string[]): Promise<void> | void;
}

export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}
