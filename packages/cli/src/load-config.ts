import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SimpleCdkError, type AppConfig } from '@simple-cdk/core';

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
    throw new SimpleCdkError({
      code: 'CONFIG_NOT_FOUND',
      message: `no simple-cdk config found.`,
      resource: cwd,
      available: DEFAULT_NAMES,
      hint: `create a simple-cdk.config.ts (see "simple-cdk init") or pass --config <path>.`,
    });
  }
  let mod: unknown;
  try {
    mod = await import(pathToFileURL(path).href);
  } catch (err) {
    // If the user's config threw a SimpleCdkError (e.g. from defineConfig's
    // validation), surface it directly — it already has actionable details.
    if (err instanceof SimpleCdkError) throw err;
    throw new SimpleCdkError({
      code: 'CONFIG_INVALID',
      message: `failed to load config at ${path}.`,
      hint: 'check the config file for syntax errors, missing imports, or unresolved packages — run with SIMPLE_CDK_DEBUG=1 to see the underlying error.',
      cause: err,
    });
  }
  const config = ((mod as { default?: unknown; config?: unknown }).default ??
    (mod as { config?: unknown }).config) as AppConfig | undefined;
  if (!config) {
    throw new SimpleCdkError({
      code: 'CONFIG_INVALID',
      message: `${path} must export a config (default export or named "config").`,
      hint: 'add `export default defineConfig({ ... })` at the end of your config file.',
    });
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
