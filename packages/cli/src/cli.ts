import { SimpleCdkError } from '@simple-cdk/core';
import { parseArgs } from './args.js';
import { listCommand } from './commands/list.js';
import { initCommand } from './commands/init.js';
import { createCommand } from './commands/create.js';
import { generateSchemaCommand } from './commands/generate-schema.js';
import { makeCdkCommand } from './commands/cdk-passthrough.js';
import { helpCommand } from './commands/help.js';

const KNOWN_VERBS = [
  'init',
  'create',
  'generate-schema',
  'list',
  'synth',
  'deploy',
  'diff',
  'destroy',
  'help',
] as const;

export async function run(argv: string[]): Promise<void> {
  // Strip cdk-passthrough args before parsing our own.
  const splitIdx = argv.indexOf('--');
  const own = splitIdx >= 0 ? argv.slice(0, splitIdx) : argv;
  const args = parseArgs(own);
  const [verb] = args.positional;

  switch (verb) {
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      helpCommand();
      return;
    case 'init':
      await initCommand();
      return;
    case 'create':
      await createCommand(args);
      return;
    case 'generate-schema':
      await generateSchemaCommand(args);
      return;
    case 'list':
      await listCommand(args);
      return;
    case 'synth':
    case 'deploy':
    case 'diff':
    case 'destroy':
      await makeCdkCommand(verb)(args);
      return;
    default:
      throw new SimpleCdkError({
        code: 'USER_INPUT',
        message: `unknown command: "${verb}".`,
        available: [...KNOWN_VERBS],
        hint: 'run `simple-cdk help` for the full command list.',
      });
  }
}
