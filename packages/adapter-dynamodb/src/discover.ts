import { pathToFileURL } from 'node:url';
import { scanFiles, type DiscoveryReport, type Resource } from '@simple-cdk/core';
import type { DynamoDbModelConfig, DynamoDbResourceConfig } from './types.js';

export async function discoverModels(
  rootDir: string,
  dir: string,
  match: string[],
  report?: DiscoveryReport,
): Promise<Resource<DynamoDbResourceConfig>[]> {
  const files = await scanFiles(rootDir, { dir, match });
  const found: Resource<DynamoDbResourceConfig>[] = [];

  for (const file of files) {
    const result = await loadModel(file.absolutePath);
    if (!result.ok) {
      report?.add({
        adapter: 'dynamodb',
        file: file.absolutePath,
        severity: 'error',
        reason: result.reason,
        cause: result.cause,
      });
      continue;
    }
    const modelConfig = result.value;
    found.push({
      type: 'dynamodb-table',
      name: modelConfig.name ?? file.stem,
      source: file.absolutePath,
      config: { modelConfig, sourceFile: file.absolutePath },
    });
  }
  return found;
}

type LoadResult =
  | { ok: true; value: DynamoDbModelConfig }
  | { ok: false; reason: string; cause?: unknown };

async function loadModel(file: string): Promise<LoadResult> {
  let mod: unknown;
  try {
    mod = await import(pathToFileURL(file).href);
  } catch (cause) {
    return {
      ok: false,
      reason: 'failed to import model file (syntax error, missing dependency, or bad export)',
      cause,
    };
  }
  const m = mod as { default?: unknown; model?: unknown; config?: unknown };
  const config = (m.default ?? m.model ?? m.config) as DynamoDbModelConfig | undefined;
  if (!config) {
    return {
      ok: false,
      reason: 'model file has no default export (expected `export default { pk: { name: "id" } } satisfies DynamoDbModelConfig`)',
    };
  }
  if (!config.pk?.name) {
    return {
      ok: false,
      reason: 'model is missing `pk.name` — DynamoDB tables require a partition key (e.g. `pk: { name: "id" }`)',
    };
  }
  return { ok: true, value: config };
}
