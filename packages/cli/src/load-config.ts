import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { AppConfig } from '@simple-cdk/core';

const DEFAULT_NAMES = [
  'simple-cdk.config.ts',
  'simple-cdk.config.mts',
  'simple-cdk.config.js',
  'simple-cdk.config.mjs',
];

export interface LoadedConfig {
  config: AppConfig;
  path: string;
  rootDir: string;
}

export async function loadConfig(cwd: string, override?: string): Promise<LoadedConfig> {
  const path = override ? resolve(cwd, override) : await pickFirstExisting(cwd);
  if (!path) {
    throw new Error(
      `No config found. Looked for ${DEFAULT_NAMES.join(', ')} in ${cwd}. ` +
        `Use --config <path> or create simple-cdk.config.ts.`,
    );
  }
  const mod = await import(pathToFileURL(path).href);
  const config = (mod.default ?? mod.config) as AppConfig | undefined;
  if (!config) {
    throw new Error(`${path} must export a config (default export or named "config")`);
  }
  return { config, path, rootDir: cwd };
}

async function pickFirstExisting(cwd: string): Promise<string | undefined> {
  for (const name of DEFAULT_NAMES) {
    const candidate = resolve(cwd, name);
    try {
      const s = await stat(candidate);
      if (s.isFile()) return candidate;
    } catch {
      // not present
    }
  }
  return undefined;
}
