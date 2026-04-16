import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../load-config.js';
import type { ParsedArgs } from '../args.js';
import { flagAsString } from '../args.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * `simple-cdk synth | deploy | diff | destroy` — load the user's config so
 * we know the stage/region, then spawn the AWS CDK CLI with our runtime.ts
 * as the `--app` entry. Anything after `--` is forwarded raw to cdk.
 */
export function makeCdkCommand(verb: 'synth' | 'deploy' | 'diff' | 'destroy') {
  return async function run(args: ParsedArgs): Promise<void> {
    const cwd = process.cwd();
    const configFlag = flagAsString(args.flags, 'config');
    const stageFlag = flagAsString(args.flags, 'stage');
    const { path: configPath } = await loadConfig(cwd, configFlag);

    const runtime = resolve(__dirname, '..', 'runtime.js');
    const cdkBin = resolve(__dirname, '..', '..', '..', '..', 'node_modules', '.bin', 'cdk');
    const passthroughIdx = process.argv.indexOf('--');
    const passthrough = passthroughIdx >= 0 ? process.argv.slice(passthroughIdx + 1) : [];

    const env = {
      ...process.env,
      SIMPLE_CDK_CONFIG_PATH: configPath,
      ...(stageFlag ? { SIMPLE_CDK_STAGE: stageFlag } : {}),
    };

    // tsx provides on-the-fly TypeScript loading — both for the runtime
    // itself (when invoked from source) and for the user's TS config.
    const appArg = `npx tsx --no-warnings ${JSON.stringify(runtime)}`;

    const child = spawn(cdkBin, [verb, '--app', appArg, ...passthrough], {
      stdio: 'inherit',
      env,
    });

    await new Promise<void>((resolveExit, rejectExit) => {
      child.on('exit', (code) => {
        if (code === 0) resolveExit();
        else rejectExit(new Error(`cdk ${verb} exited with code ${code}`));
      });
      child.on('error', rejectExit);
    });
  };
}
