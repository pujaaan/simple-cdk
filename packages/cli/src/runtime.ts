/**
 * Entry that the AWS CDK CLI invokes via `--app`. It loads the user's
 * config, runs the simple-cdk engine, and lets CDK handle the rest.
 *
 * The CLI passes context via env vars so this module stays simple:
 *   SIMPLE_CDK_CONFIG_PATH — absolute path to the config
 *   SIMPLE_CDK_STAGE       — which stage to synth
 */
import { Engine, SimpleCdkError } from '@simple-cdk/core';
import { pathToFileURL } from 'node:url';
import { presentError } from './error-present.js';

async function main(): Promise<void> {
  const path = process.env.SIMPLE_CDK_CONFIG_PATH;
  const stage = process.env.SIMPLE_CDK_STAGE;
  if (!path) {
    throw new SimpleCdkError({
      code: 'USER_INPUT',
      message: 'SIMPLE_CDK_CONFIG_PATH is required when invoking runtime.ts directly.',
      hint: 'This module is invoked by the simple-cdk CLI — run `simple-cdk synth/deploy/diff/destroy` instead of calling runtime.ts yourself.',
    });
  }
  const mod = await import(pathToFileURL(path).href);
  const config = mod.default ?? mod.config;
  if (!config) {
    throw new SimpleCdkError({
      code: 'CONFIG_INVALID',
      message: `${path} must export a config (default export or named "config").`,
      hint: 'add `export default defineConfig({ ... })` to your simple-cdk.config.ts.',
    });
  }
  const engine = new Engine(config, { stage });
  const app = await engine.synth();
  app.synth();
}

main().catch((err) => {
  process.exit(presentError(err));
});
