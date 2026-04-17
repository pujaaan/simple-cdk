import { App, Stack, Tags } from 'aws-cdk-lib';
import { resolveConfig, type ResolveOptions } from './config.js';
import { createLogger } from './logger.js';
import { createDiscoveryReport } from './discovery-report.js';
import { SimpleCdkError } from './error.js';
import type {
  Adapter,
  AppConfig,
  DiscoveryReport,
  Resource,
  ResolvedAppConfig,
  RegisterContext,
  StackOptions,
  WireContext,
  Logger,
} from './types.js';

export interface SynthOptions extends ResolveOptions {
  /** Existing CDK App instance to use. If omitted, the engine creates one. */
  cdkApp?: App;
}

/**
 * Runs the adapter lifecycle: discover → register → wire. The engine itself
 * knows nothing about specific AWS services — it just orchestrates the phases
 * and gives adapters a typed context to work in.
 */
export class Engine {
  private readonly resolved: ResolvedAppConfig;
  private readonly log: Logger;
  private readonly resourcesByAdapter = new Map<string, Resource[]>();
  private readonly stacks = new Map<string, Stack>();
  private readonly discoveryReport: DiscoveryReport = createDiscoveryReport();

  constructor(config: AppConfig, opts: ResolveOptions = {}) {
    this.resolved = resolveConfig(config, opts);
    this.log = createLogger('engine');
  }

  get config(): ResolvedAppConfig {
    return this.resolved;
  }

  /** Per-file discovery problems collected across all adapters. */
  get report(): DiscoveryReport {
    return this.discoveryReport;
  }

  async synth(opts: SynthOptions = {}): Promise<App> {
    const app = opts.cdkApp ?? new App();
    this.log.info(`synth start`, { app: this.resolved.app, stage: this.resolved.stage });

    await this.runDiscover();
    if (this.discoveryReport.hasErrors()) {
      const errs = this.discoveryReport.issues.filter((i) => i.severity === 'error');
      const body = errs
        .map((i) => `  - [${i.adapter}] ${i.file}: ${i.reason}`)
        .join('\n');
      throw new SimpleCdkError({
        code: 'DISCOVERY_FAILED',
        message: `discovery produced ${errs.length} error(s); refusing to synth.\n${body}`,
        hint: 'run `simple-cdk list` to see all issues, then fix the listed files. Set SIMPLE_CDK_DEBUG=1 for underlying errors.',
      });
    }
    await this.runRegister(app);
    await this.runWire(app);

    this.log.info(`synth complete`, {
      stacks: this.stacks.size,
      resources: countResources(this.resourcesByAdapter),
    });
    return app;
  }

  /** Run discovery only, returning the per-adapter resources. Used by `simple-cdk list`. */
  async discover(): Promise<Map<string, Resource[]>> {
    await this.runDiscover();
    return this.resourcesByAdapter;
  }

  private async runDiscover(): Promise<void> {
    for (const adapter of this.resolved.adapters) {
      if (!adapter.discover) {
        this.resourcesByAdapter.set(adapter.name, []);
        continue;
      }
      const adapterLog = createLogger(`adapter:${adapter.name}`);
      const resources = await adapter.discover({
        config: this.resolved,
        rootDir: this.resolved.rootDir,
        log: adapterLog,
        report: this.discoveryReport,
      });
      this.resourcesByAdapter.set(adapter.name, resources);
      adapterLog.info(`discovered ${resources.length} resource(s)`);
    }
  }

  private async runRegister(app: App): Promise<void> {
    for (const adapter of this.resolved.adapters) {
      if (!adapter.register) continue;
      const ctx = this.buildRegisterContext(app, adapter);
      await adapter.register(ctx);
    }
  }

  private async runWire(app: App): Promise<void> {
    for (const adapter of this.resolved.adapters) {
      if (!adapter.wire) continue;
      const base = this.buildRegisterContext(app, adapter);
      const ctx: WireContext = {
        ...base,
        resourcesOf: (name) => this.resourcesByAdapter.get(name) ?? [],
      };
      await adapter.wire(ctx);
    }
  }

  private buildRegisterContext(app: App, adapter: Adapter): RegisterContext {
    return {
      config: this.resolved,
      app,
      stack: (name, opts) => this.getOrCreateStack(app, name, opts),
      resources: this.resourcesByAdapter.get(adapter.name) ?? [],
      allResources: this.resourcesByAdapter,
      log: createLogger(`adapter:${adapter.name}`),
    };
  }

  private getOrCreateStack(app: App, name: string, opts?: StackOptions): Stack {
    const existing = this.stacks.get(name);
    if (existing) {
      if (opts?.id && Stack.of(existing).stackName !== opts.id) {
        throw new Error(
          `Stack "${name}" already created with id "${Stack.of(existing).stackName}"; cannot rebind to "${opts.id}".`,
        );
      }
      return existing;
    }

    const { app: appName, stage, stageConfig } = this.resolved;
    const id = opts?.id ?? `${appName}-${stage}-${name}`;
    const stack = new Stack(app, id, {
      env: { account: stageConfig.account, region: stageConfig.region },
      description: `${appName} ${stage} ${name} stack`,
    });

    // Removal policy is applied per-resource by adapters — stacks themselves
    // are not retained/destroyed at the stack level. Adapters read
    // `stageConfig.removalPolicy` from the context to decide.
    Tags.of(stack).add('app', appName);
    Tags.of(stack).add('stage', stage);
    for (const [k, v] of Object.entries(stageConfig.tags ?? {})) {
      Tags.of(stack).add(k, v);
    }

    this.stacks.set(name, stack);
    return stack;
  }
}

function countResources(map: Map<string, Resource[]>): number {
  let n = 0;
  for (const list of map.values()) n += list.length;
  return n;
}
