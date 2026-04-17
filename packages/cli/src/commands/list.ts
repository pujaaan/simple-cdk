import { Engine } from '@simple-cdk/core';
import { loadConfig } from '../load-config.js';
import type { ParsedArgs } from '../args.js';
import { flagAsString } from '../args.js';
import { yellow, red, dim } from '../output.js';

/**
 * `simple-cdk list` — load the config, run discovery only, and print what
 * each adapter found plus any per-file issues. Exit 0 unless a fatal
 * discovery error occurred (in which case the engine throws before we get
 * here; we only print warnings and non-fatal errors from the report).
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

  const resourcesByAdapter = await engine.discover();
  for (const adapter of engine.config.adapters) {
    if (!adapter.discover) {
      console.log(`  ${adapter.name}: (no discovery)`);
      continue;
    }
    const resources = resourcesByAdapter.get(adapter.name) ?? [];
    console.log(`  ${adapter.name}: ${resources.length} resource(s)`);
    for (const r of resources) {
      console.log(`    - ${r.name} (${r.type})`);
    }
  }

  // Surface any discovery issues collected by the adapters.
  const issues = engine.report.issues;
  if (issues.length > 0) {
    console.log('');
    console.log(yellow(`discovery issues (${issues.length}):`));
    for (const issue of issues) {
      const tag = issue.severity === 'error' ? red('error') : yellow('warn');
      console.log(`  ${tag} [${issue.adapter}] ${issue.file}`);
      console.log(dim(`        ${issue.reason}`));
    }
    if (issues.some((i) => i.severity === 'error')) {
      console.log('');
      console.log(red('deploy will fail until the errors above are fixed.'));
      console.log(dim('(run with SIMPLE_CDK_DEBUG=1 to see underlying import errors.)'));
    }
  }
}
