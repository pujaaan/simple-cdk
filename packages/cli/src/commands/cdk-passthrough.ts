import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import type { AppConfig } from '@simple-cdk/core';
import { loadConfig } from '../load-config.js';
import type { ParsedArgs } from '../args.js';
import { flagAsString } from '../args.js';
import { renderDiff, renderDeploy, bold, dim } from '../output.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

type CdkVerb = 'synth' | 'deploy' | 'diff' | 'destroy';

/**
 * `simple-cdk synth | deploy | diff | destroy` — load the user's config so
 * we know the stage/region, then spawn the AWS CDK CLI with our runtime.ts
 * as the `--app` entry. Anything after `--` is forwarded raw to cdk.
 */
export function makeCdkCommand(verb: CdkVerb) {
  return async function run(args: ParsedArgs): Promise<void> {
    const cwd = process.cwd();
    const configFlag = flagAsString(args.flags, 'config');
    const stageFlag = flagAsString(args.flags, 'stage');
    const all = args.flags.all === true;
    const verbose = args.flags.verbose === true;
    const { path: configPath, config } = await loadConfig(cwd, configFlag);

    const stages = await resolveStages(config, verb, { stageFlag, all });
    if (stages.length === 0) {
      throw new Error('No stages configured. Add one to simple-cdk.config.ts.');
    }

    for (const stage of stages) {
      if (stages.length > 1) {
        const s = config.stages[stage]!;
        console.log();
        console.log(bold(`━━━  ${stage} · ${s.region}${s.account ? ` · ${s.account}` : ''}  ━━━`));
      }
      await runOnce({ verb, stage, configPath, verbose });
    }
  };
}

async function runOnce(opts: {
  verb: CdkVerb;
  stage: string | undefined;
  configPath: string;
  verbose: boolean;
}): Promise<void> {
  const { verb, stage, configPath, verbose } = opts;
  const runtime = resolve(__dirname, '..', 'runtime.js');
  const cdkBin = resolve(__dirname, '..', '..', '..', '..', 'node_modules', '.bin', 'cdk');
  const passthroughIdx = process.argv.indexOf('--');
  const passthrough = passthroughIdx >= 0 ? process.argv.slice(passthroughIdx + 1) : [];

  const env = {
    ...process.env,
    SIMPLE_CDK_CONFIG_PATH: configPath,
    ...(stage ? { SIMPLE_CDK_STAGE: stage } : {}),
  };

  const appArg = `npx tsx --no-warnings ${JSON.stringify(runtime)}`;
  const shouldFormat = !verbose && (verb === 'diff' || verb === 'deploy');

  const child = spawn(cdkBin, [verb, '--app', appArg, ...passthrough], {
    stdio: shouldFormat ? ['inherit', 'pipe', 'pipe'] : 'inherit',
    env,
  });

  const rendering = shouldFormat
    ? verb === 'diff'
      ? renderDiff(child.stdout!, child.stderr!)
      : renderDeploy(child.stdout!, child.stderr!)
    : Promise.resolve();

  await Promise.all([
    rendering,
    new Promise<void>((resolveExit, rejectExit) => {
      child.on('exit', (code) => {
        if (code === 0) resolveExit();
        else rejectExit(new Error(`cdk ${verb} exited with code ${code}`));
      });
      child.on('error', rejectExit);
    }),
  ]);
}

async function resolveStages(
  config: AppConfig,
  verb: string,
  opts: { stageFlag?: string; all: boolean },
): Promise<string[]> {
  const names = Object.keys(config.stages);
  if (opts.all) return names;
  if (opts.stageFlag) return [opts.stageFlag];
  if (names.length <= 1) return names;
  if (!stdin.isTTY) return [config.defaultStage ?? names[0]!];

  const rl = createInterface({ input: stdin, output: stdout });
  try {
    console.log(`Pick a stage to ${verb}:`);
    names.forEach((name, i) => {
      const s = config.stages[name]!;
      const acct = s.account ? ` · account ${s.account}` : '';
      const def = name === config.defaultStage ? ' (default)' : '';
      console.log(`  ${i + 1}) ${name} — ${s.region}${acct}${def}`);
    });
    console.log(`  ${names.length + 1}) all — ${verb} every stage sequentially`);
    console.log(dim(`  (tip: pass --stage <name>, --all, or --verbose to skip prompts/formatting)`));
    const defaultIdx = Math.max(1, config.defaultStage ? names.indexOf(config.defaultStage) + 1 : 1);
    const answer = (await rl.question(`Choice [${defaultIdx}]: `)).trim();
    if (!answer) return [names[defaultIdx - 1]!];
    if (answer === 'all') return names;
    const asNum = Number(answer);
    if (Number.isInteger(asNum)) {
      if (asNum === names.length + 1) return names;
      if (asNum >= 1 && asNum <= names.length) return [names[asNum - 1]!];
    }
    if (names.includes(answer)) return [answer];
    throw new Error(`Invalid stage: ${answer}. Expected 1-${names.length + 1}, a stage name, or "all".`);
  } finally {
    rl.close();
  }
}
