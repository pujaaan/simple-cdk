import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { DiscoveryReport, Resource } from '@simple-cdk/core';
import type { TriggerName, TriggerResourceConfig } from './types.js';

const HANDLER_NAMES = ['handler.ts', 'handler.js', 'handler.mts', 'handler.mjs'];

const VALID_TRIGGERS: ReadonlySet<TriggerName> = new Set([
  'pre-sign-up',
  'post-confirmation',
  'pre-authentication',
  'post-authentication',
  'pre-token-generation',
  'custom-message',
  'define-auth-challenge',
  'create-auth-challenge',
  'verify-auth-challenge',
  'user-migration',
]);

export async function discoverTriggers(
  rootDir: string,
  dir: string,
  report?: DiscoveryReport,
): Promise<Resource<TriggerResourceConfig>[]> {
  const base = join(rootDir, dir);
  let entries;
  try {
    entries = await readdir(base, { withFileTypes: true });
  } catch {
    return [];
  }

  const found: Resource<TriggerResourceConfig>[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const folder = join(base, entry.name);
    if (!VALID_TRIGGERS.has(entry.name as TriggerName)) {
      report?.add({
        adapter: 'cognito',
        file: folder,
        severity: 'warn',
        reason: `folder "${entry.name}" is not a recognized Cognito trigger — expected one of: ${[...VALID_TRIGGERS].join(', ')}`,
      });
      continue;
    }
    const handler = await pickHandler(folder);
    if (!handler) {
      report?.add({
        adapter: 'cognito',
        file: folder,
        severity: 'warn',
        reason: `trigger folder has no handler file — expected one of: ${HANDLER_NAMES.join(', ')}`,
      });
      continue;
    }
    found.push({
      type: 'cognito-trigger',
      name: entry.name,
      source: handler,
      config: { trigger: entry.name as TriggerName, handlerFile: handler },
    });
  }
  return found;
}

async function pickHandler(dir: string): Promise<string | undefined> {
  for (const name of HANDLER_NAMES) {
    const candidate = join(dir, name);
    try {
      const s = await stat(candidate);
      if (s.isFile()) return candidate;
    } catch {
      // skip
    }
  }
  return undefined;
}
