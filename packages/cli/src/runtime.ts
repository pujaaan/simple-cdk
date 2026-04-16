/**
 * Entry that the AWS CDK CLI invokes via `--app`. It loads the user's
 * config, runs the simple-cdk engine, and lets CDK handle the rest.
 *
 * The CLI passes context via env vars so this module stays simple:
 *   SIMPLE_CDK_CONFIG_PATH — absolute path to the config
 *   SIMPLE_CDK_STAGE       — which stage to synth
 */
import { Engine } from '@simple-cdk/core';
import { pathToFileURL } from 'node:url';

async function main(): Promise<void> {
  const path = process.env.SIMPLE_CDK_CONFIG_PATH;
  const stage = process.env.SIMPLE_CDK_STAGE;
  if (!path) throw new Error('SIMPLE_CDK_CONFIG_PATH is required');
  const mod = await import(pathToFileURL(path).href);
  const config = mod.default ?? mod.config;
  if (!config) throw new Error(`${path} must export a config`);
  const engine = new Engine(config, { stage });
  const app = await engine.synth();
  app.synth();
}

main().catch((err) => {
  console.error(err.stack ?? err);
  process.exit(1);
});
