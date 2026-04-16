#!/usr/bin/env node
// Activate tsx's module loader in *this* process so the user's
// simple-cdk.config.ts — and any .ts files it imports — load correctly in
// every subcommand (list, synth, deploy, ...). Without this, `list` dies
// with ERR_MODULE_NOT_FOUND on transitive .ts imports.
import { register } from 'tsx/esm/api';

register();

const mod = await import('../dist/cli.js');
try {
  await mod.run(process.argv.slice(2));
} catch (err) {
  console.error(err.stack ?? err);
  process.exit(1);
}
