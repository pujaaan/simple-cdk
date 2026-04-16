import { resolve } from 'node:path';
import type { AppConfig, ResolvedAppConfig } from './types.js';

/**
 * Identity helper that gives consumers full type inference and validation
 * without needing to import the AppConfig type directly.
 */
export function defineConfig(config: AppConfig): AppConfig {
  return config;
}

export interface ResolveOptions {
  stage?: string;
  rootDir?: string;
}

export function resolveConfig(config: AppConfig, opts: ResolveOptions = {}): ResolvedAppConfig {
  if (!config.app || typeof config.app !== 'string') {
    throw new Error('config.app is required and must be a string');
  }
  if (!config.stages || Object.keys(config.stages).length === 0) {
    throw new Error('config.stages must define at least one stage');
  }
  if (!Array.isArray(config.adapters) || config.adapters.length === 0) {
    throw new Error('config.adapters must include at least one adapter');
  }

  const stage = opts.stage ?? config.defaultStage ?? Object.keys(config.stages)[0]!;
  const stageConfig = config.stages[stage];
  if (!stageConfig) {
    const known = Object.keys(config.stages).join(', ');
    throw new Error(`Unknown stage "${stage}". Known stages: ${known}`);
  }
  if (!stageConfig.region) {
    throw new Error(`Stage "${stage}" is missing required "region"`);
  }

  const seen = new Set<string>();
  for (const adapter of config.adapters) {
    if (!adapter.name) throw new Error('Every adapter must declare a name');
    if (seen.has(adapter.name)) {
      throw new Error(
        `Duplicate adapter name "${adapter.name}". Adapter names must be unique — ` +
          `if you intend to override, replace the original in the adapters array.`,
      );
    }
    seen.add(adapter.name);
  }

  const rootDir = resolve(opts.rootDir ?? config.rootDir ?? process.cwd());

  return { ...config, rootDir, stage, stageConfig };
}
