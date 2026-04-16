import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Resource } from '@simple-cdk/core';
import type { LambdaResourceConfig, LambdaFunctionConfig } from './types.js';

const HANDLER_NAMES = ['handler.ts', 'handler.js', 'handler.mts', 'handler.mjs'];
const CONFIG_NAMES = ['config.ts', 'config.js', 'config.mts', 'config.mjs'];

export async function discoverLambdas(rootDir: string, dir: string): Promise<Resource<LambdaResourceConfig>[]> {
  const base = join(rootDir, dir);
  let entries;
  try {
    entries = await readdir(base, { withFileTypes: true });
  } catch {
    return [];
  }

  const found: Resource<LambdaResourceConfig>[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const fnDir = join(base, entry.name);
    const handlerFile = await pickFile(fnDir, HANDLER_NAMES);
    if (!handlerFile) continue;
    const configFile = await pickFile(fnDir, CONFIG_NAMES);
    const functionConfig = configFile ? await loadConfig(configFile) : {};
    found.push({
      type: 'lambda',
      name: functionConfig.name ?? entry.name,
      source: handlerFile,
      config: { handlerFile, configFile, functionConfig },
    });
  }
  return found.sort((a, b) => a.name.localeCompare(b.name));
}

async function pickFile(dir: string, names: string[]): Promise<string | undefined> {
  for (const name of names) {
    const candidate = join(dir, name);
    try {
      const s = await stat(candidate);
      if (s.isFile()) return candidate;
    } catch {
      // not present
    }
  }
  return undefined;
}

async function loadConfig(file: string): Promise<LambdaFunctionConfig> {
  // TS configs work when synth runs through a TS-aware loader (tsx, ts-node).
  // If the loader isn't present, we fall back to defaults silently.
  try {
    const mod = await import(pathToFileURL(file).href);
    return (mod.default ?? mod.config ?? {}) as LambdaFunctionConfig;
  } catch {
    return {};
  }
}
