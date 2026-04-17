import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { Engine, SimpleCdkError } from '@simple-cdk/core';
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
    throw new SimpleCdkError({
      code: 'USER_INPUT',
      message: 'no dynamodb adapter found in config — nothing to generate.',
      hint: 'add dynamoDbAdapter() to your config.adapters before running generate-schema.',
    });
  }

  const resourcesByAdapter = await engine.discover();
  if (engine.report.hasErrors()) {
    const errs = engine.report.issues.filter((i) => i.severity === 'error');
    const body = errs.map((i) => `  - [${i.adapter}] ${i.file}: ${i.reason}`).join('\n');
    throw new SimpleCdkError({
      code: 'DISCOVERY_FAILED',
      message: `cannot generate schema — ${errs.length} discovery error(s):\n${body}`,
      hint: 'fix the listed files (run `simple-cdk list` for the full report) and try again.',
    });
  }

  const resources = resourcesByAdapter.get('dynamodb') ?? [];
  if (resources.length === 0) {
    throw new SimpleCdkError({
      code: 'USER_INPUT',
      message: 'the dynamodb adapter discovered no models.',
      hint: 'create at least one backend/models/<name>.model.ts — see README for the expected shape.',
    });
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
    throw new SimpleCdkError({
      code: 'USER_INPUT',
      message: '@simple-cdk/dynamodb is not installed.',
      hint: 'install it with `npm install @simple-cdk/dynamodb` and try again.',
    });
  }
  const mod = (await import(pathToFileURL(resolved).href)) as {
    generateGraphQLSchema?: (models: unknown[]) => string;
  };
  if (typeof mod.generateGraphQLSchema !== 'function') {
    throw new SimpleCdkError({
      code: 'USER_INPUT',
      message: 'installed @simple-cdk/dynamodb does not export generateGraphQLSchema.',
      hint: 'upgrade @simple-cdk/dynamodb to 1.1.0 or later.',
    });
  }
  return mod.generateGraphQLSchema;
}
