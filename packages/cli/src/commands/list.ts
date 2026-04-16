import { Engine } from '@simple-cdk/core';
import { loadConfig } from '../load-config.js';
import type { ParsedArgs } from '../args.js';
import { flagAsString } from '../args.js';

/**
 * `simple-cdk list` — load the config, run discovery only, and print what
 * each adapter found. Useful sanity check before deploying.
 */
export async function listCommand(args: ParsedArgs): Promise<void> {
  const cwd = process.cwd();
  const configFlag = flagAsString(args.flags, 'config');
  const stageFlag = flagAsString(args.flags, 'stage');
  const { config } = await loadConfig(cwd, configFlag);

  const engine = new Engine(config, { stage: stageFlag, rootDir: cwd });
  console.log(`app: ${engine.config.app}`);
  console.log(`stage: ${engine.config.stage} (${engine.config.stageConfig.region})`);
  console.log(`adapters: ${engine.config.adapters.map((a) => a.name).join(', ')}`);
  console.log('');

  for (const adapter of engine.config.adapters) {
    if (!adapter.discover) {
      console.log(`  ${adapter.name}: (no discovery)`);
      continue;
    }
    const resources = await adapter.discover({
      config: engine.config,
      rootDir: engine.config.rootDir,
      log: silentLogger(),
    });
    console.log(`  ${adapter.name}: ${resources.length} resource(s)`);
    for (const r of resources) {
      console.log(`    - ${r.name} (${r.type})`);
    }
  }
}

function silentLogger() {
  return { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
}
