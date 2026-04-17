import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { SimpleCdkError } from '@simple-cdk/core';
import type { ParsedArgs } from '../args.js';
import { flagAsString } from '../args.js';

type Kind = 'model' | 'function' | 'trigger';

const COGNITO_TRIGGERS = [
  'pre-sign-up',
  'post-confirmation',
  'pre-authentication',
  'post-authentication',
  'pre-token-generation',
  'custom-message',
  'define-auth-challenge',
  'create-auth-challenge',
  'verify-auth-challenge',
  'user-migration',
] as const;

const DEFAULT_DIRS: Record<Kind, string> = {
  model: 'backend/models',
  function: 'backend/functions',
  trigger: 'backend/triggers',
};

/**
 * `simple-cdk create <kind> <name> [--dir <path>]` — scaffold a new model,
 * function, or trigger into the conventional folder. Intentionally simple:
 * if the project uses custom paths, pass `--dir`, or move the generated
 * file afterwards.
 */
export async function createCommand(args: ParsedArgs): Promise<void> {
  const [, rawKind, rawName] = args.positional;
  if (!rawKind || !rawName) {
    throw new SimpleCdkError({
      code: 'USER_INPUT',
      message: 'missing arguments for `simple-cdk create`.',
      hint: 'usage: simple-cdk create <model|function|trigger> <name> [--dir <path>]',
    });
  }

  const kind = parseKind(rawKind);
  if (!kind) {
    throw new SimpleCdkError({
      code: 'USER_INPUT',
      message: `unknown create kind: "${rawKind}".`,
      available: ['model', 'function', 'trigger'],
      hint: 'expected one of: model, function, trigger.',
    });
  }

  const name = rawName.trim();
  if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(name)) {
    throw new SimpleCdkError({
      code: 'USER_INPUT',
      message: `invalid name "${name}".`,
      hint: 'use letters, digits, hyphens, or underscores; must start with a letter.',
    });
  }

  if (kind === 'trigger' && !(COGNITO_TRIGGERS as readonly string[]).includes(name)) {
    throw new SimpleCdkError({
      code: 'USER_INPUT',
      message: `"${name}" is not a recognized Cognito trigger.`,
      available: [...COGNITO_TRIGGERS],
      hint: 'pick one of the valid trigger names above.',
    });
  }

  const cwd = process.cwd();
  const baseDir = flagAsString(args.flags, 'dir') ?? DEFAULT_DIRS[kind];

  switch (kind) {
    case 'model':
      await scaffoldModel(cwd, baseDir, name);
      break;
    case 'function':
      await scaffoldFunction(cwd, baseDir, name);
      break;
    case 'trigger':
      await scaffoldTrigger(cwd, baseDir, name);
      break;
  }
}

function parseKind(v: string): Kind | null {
  if (v === 'model' || v === 'function' || v === 'trigger') return v;
  return null;
}

async function scaffoldModel(cwd: string, dir: string, name: string): Promise<void> {
  const fullDir = join(cwd, dir);
  await mkdir(fullDir, { recursive: true });
  const filePath = join(fullDir, `${name}.model.ts`);
  if (existsSync(filePath)) {
    throw new SimpleCdkError({
      code: 'USER_INPUT',
      message: `file already exists: ${filePath}.`,
      hint: 'delete or rename the existing file, or pass a different <name>.',
    });
  }
  const content = `import type { DynamoDbModelConfig } from '@simple-cdk/dynamodb';

export default {
  pk: { name: 'id' },
  // sk: { name: 'sk' },
  // gsis: [{ name: 'byOwner', pk: { name: 'ownerId' } }],
  // streamTargets: ['on-${name}-change'],
} satisfies DynamoDbModelConfig;
`;
  await writeFile(filePath, content, 'utf8');
  console.log(`Created ${relPath(cwd, filePath)}`);
}

async function scaffoldFunction(cwd: string, dir: string, name: string): Promise<void> {
  const fullDir = join(cwd, dir, name);
  await mkdir(fullDir, { recursive: true });
  const handlerPath = join(fullDir, 'handler.ts');
  if (existsSync(handlerPath)) {
    throw new SimpleCdkError({
      code: 'USER_INPUT',
      message: `file already exists: ${handlerPath}.`,
      hint: 'delete or rename the existing handler, or pass a different <name>.',
    });
  }
  const handler = `export const handler = async (event: unknown) => {
  return { ok: true };
};
`;
  await writeFile(handlerPath, handler, 'utf8');
  console.log(`Created ${relPath(cwd, handlerPath)}`);
}

async function scaffoldTrigger(cwd: string, dir: string, name: string): Promise<void> {
  const fullDir = join(cwd, dir, name);
  await mkdir(fullDir, { recursive: true });
  const handlerPath = join(fullDir, 'handler.ts');
  if (existsSync(handlerPath)) {
    throw new SimpleCdkError({
      code: 'USER_INPUT',
      message: `file already exists: ${handlerPath}.`,
      hint: 'delete or rename the existing handler, or pass a different <name>.',
    });
  }
  const handler = `export const handler = async (event: any) => {
  // Cognito ${name} trigger. Mutate \`event\` or throw to reject.
  return event;
};
`;
  await writeFile(handlerPath, handler, 'utf8');
  console.log(`Created ${relPath(cwd, handlerPath)}`);
}

function relPath(cwd: string, p: string): string {
  return p.startsWith(cwd) ? p.slice(cwd.length + 1) : p;
}
