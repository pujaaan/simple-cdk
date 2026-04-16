import { pathToFileURL } from 'node:url';
import { scanFiles, type Resource } from '@simple-cdk/core';
import type { DynamoDbModelConfig, DynamoDbResourceConfig } from './types.js';

export async function discoverModels(
  rootDir: string,
  dir: string,
  match: string[],
): Promise<Resource<DynamoDbResourceConfig>[]> {
  const files = await scanFiles(rootDir, { dir, match });
  const found: Resource<DynamoDbResourceConfig>[] = [];

  for (const file of files) {
    const modelConfig = await loadModel(file.absolutePath);
    if (!modelConfig) continue;
    found.push({
      type: 'dynamodb-table',
      name: modelConfig.name ?? file.stem,
      source: file.absolutePath,
      config: { modelConfig, sourceFile: file.absolutePath },
    });
  }
  return found;
}

async function loadModel(file: string): Promise<DynamoDbModelConfig | undefined> {
  try {
    const mod = await import(pathToFileURL(file).href);
    const config = (mod.default ?? mod.model ?? mod.config) as DynamoDbModelConfig | undefined;
    if (!config?.pk?.name) return undefined;
    return config;
  } catch {
    return undefined;
  }
}
