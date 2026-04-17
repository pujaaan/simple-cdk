import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { Engine } from '@simple-cdk/core';
import { loadConfig } from '../load-config.js';
import type { ParsedArgs } from '../args.js';
import { flagAsString } from '../args.js';

/**
 * `simple-cdk generate-schema` — discover DynamoDB models in the current
 * config and write a GraphQL schema covering `type Model`, connections,
 * CRUD input types, and Query/Mutation fields to `schema.graphql`.
 *
 * Pair with `appSyncAdapter({ generateCrud: { models: 'all' } })` to wire
 * the emitted operations to auto-CRUD resolvers.
 */
export async function generateSchemaCommand(args: ParsedArgs): Promise<void> {
  const cwd = process.cwd();
  const configFlag = flagAsString(args.flags, 'config');
  const stageFlag = flagAsString(args.flags, 'stage');
  const out = flagAsString(args.flags, 'out') ?? 'schema.graphql';

  const { config } = await loadConfig(cwd, configFlag);
  const engine = new Engine(config, { stage: stageFlag, rootDir: cwd });

  const adapter = engine.config.adapters.find((a) => a.name === 'dynamodb');
  if (!adapter || !adapter.discover) {
    console.error('No dynamodb adapter found in config — nothing to generate.');
    process.exit(1);
  }

  const resources = await adapter.discover({
    config: engine.config,
    rootDir: engine.config.rootDir,
    log: silentLogger(),
  });

  if (resources.length === 0) {
    console.error(
      'The dynamodb adapter discovered no models. Check your `backend/models/*.model.ts` files.',
    );
    process.exit(1);
  }

  const named = resources.map((r) => ({
    name: r.name,
    config: (r.config as { modelConfig: unknown }).modelConfig,
  }));

  const generate = await loadGenerator(cwd);

  const sdl = generate(named as Parameters<typeof generate>[0]);
  const outPath = resolve(cwd, out);
  await writeFile(outPath, sdl, 'utf8');
  console.log(`Wrote ${out} (${resources.length} model${resources.length === 1 ? '' : 's'}).`);
}

async function loadGenerator(
  cwd: string,
): Promise<(models: unknown[]) => string> {
  const req = createRequire(resolve(cwd, 'package.json'));
  let resolved: string;
  try {
    resolved = req.resolve('@simple-cdk/dynamodb');
  } catch {
    console.error(
      '@simple-cdk/dynamodb is not installed. Install it with `npm install @simple-cdk/dynamodb` and try again.',
    );
    process.exit(1);
  }
  const mod = (await import(pathToFileURL(resolved).href)) as {
    generateGraphQLSchema: (models: unknown[]) => string;
  };
  if (typeof mod.generateGraphQLSchema !== 'function') {
    console.error(
      'Installed @simple-cdk/dynamodb does not export generateGraphQLSchema — upgrade to 1.1.0 or later.',
    );
    process.exit(1);
  }
  return mod.generateGraphQLSchema;
}

function silentLogger() {
  return { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
}
