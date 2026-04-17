import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { DiscoveryReport, Resource } from '@simple-cdk/core';
import type { LambdaResourceConfig, LambdaFunctionConfig } from './types.js';

const HANDLER_NAMES = ['handler.ts', 'handler.js', 'handler.mts', 'handler.mjs'];
const CONFIG_NAMES = ['config.ts', 'config.js', 'config.mts', 'config.mjs'];

export async function discoverLambdas(
  rootDir: string,
  dir: string,
  report?: DiscoveryReport,
): Promise<Resource<LambdaResourceConfig>[]> {
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
    if (!handlerFile) {
      report?.add({
        adapter: 'lambda',
        file: fnDir,
        severity: 'warn',
        reason: `folder contains no handler file — expected one of: ${HANDLER_NAMES.join(', ')}`,
      });
      continue;
    }
    const configFile = await pickFile(fnDir, CONFIG_NAMES);
    let functionConfig: LambdaFunctionConfig = {};
    if (configFile) {
      const loaded = await loadConfig(configFile);
      if (!loaded.ok) {
        report?.add({
          adapter: 'lambda',
          file: configFile,
          severity: 'error',
          reason: loaded.reason,
          cause: loaded.cause,
        });
        continue;
      }
      functionConfig = loaded.value;
    }
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

type LoadResult =
  | { ok: true; value: LambdaFunctionConfig }
  | { ok: false; reason: string; cause?: unknown };

async function loadConfig(file: string): Promise<LoadResult> {
  try {
    const mod = await import(pathToFileURL(file).href);
    const cfg = ((mod as { default?: unknown; config?: unknown }).default ??
      (mod as { config?: unknown }).config ?? {}) as LambdaFunctionConfig;
    return { ok: true, value: cfg };
  } catch (cause) {
    return {
      ok: false,
      reason: 'failed to import function config.ts (syntax error, missing dependency, or bad export)',
      cause,
    };
  }
}
