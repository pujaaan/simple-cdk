import type { DynamoDbModelConfig } from '@simple-cdk/dynamodb';
import type { CrudOperation } from './types.js';

/**
 * Produce AppSync JS resolver source code for a CRUD operation against a
 * DynamoDB-backed model. The generated code targets the `@aws-appsync/utils`
 * runtime and is meant to be passed as the `code` of an `AppsyncFunction`.
 *
 * Kept intentionally simple: PK + optional SK, no projection rewrites,
 * no pagination tokens, no conditional updates beyond the obvious. Bring
 * your own resolver via `resolvers: [{ ... }]` when you outgrow this.
 */
export function generateCrudCode(op: CrudOperation, model: DynamoDbModelConfig, softDelete = false): string {
  switch (op) {
    case 'get':
      return getOperation(model);
    case 'list':
      return listOperation(model);
    case 'create':
      return createOperation(model);
    case 'update':
      return updateOperation(model);
    case 'delete':
      return softDelete ? softDeleteOperation(model) : deleteOperation(model);
  }
}

function getOperation(model: DynamoDbModelConfig): string {
  const keyExpr = keyFromArgs(model);
  return `
import { util } from '@aws-appsync/utils';

export function request(ctx) {
  return {
    operation: 'GetItem',
    key: util.dynamodb.toMapValues(${keyExpr}),
  };
}

export function response(ctx) {
  if (ctx.error) util.error(ctx.error.message, ctx.error.type);
  return ctx.result;
}
`.trim();
}

function listOperation(_model: DynamoDbModelConfig): string {
  return `
import { util } from '@aws-appsync/utils';

export function request(ctx) {
  const limit = ctx.args.limit ?? 50;
  const nextToken = ctx.args.nextToken ?? null;
  return {
    operation: 'Scan',
    limit,
    nextToken,
  };
}

export function response(ctx) {
  if (ctx.error) util.error(ctx.error.message, ctx.error.type);
  return { items: ctx.result.items, nextToken: ctx.result.nextToken ?? null };
}
`.trim();
}

function createOperation(model: DynamoDbModelConfig): string {
  const keyExpr = keyFromInput(model);
  return `
import { util } from '@aws-appsync/utils';

export function request(ctx) {
  const input = ctx.args.input;
  const now = util.time.nowISO8601();
  const id = input.id ?? util.autoId();
  const item = { ...input, id, createdAt: now, updatedAt: now };
  return {
    operation: 'PutItem',
    key: util.dynamodb.toMapValues(${keyExpr.replace('input.', 'item.')}),
    attributeValues: util.dynamodb.toMapValues(item),
    condition: { expression: 'attribute_not_exists(#pk)', expressionNames: { '#pk': '${model.pk.name}' } },
  };
}

export function response(ctx) {
  if (ctx.error) util.error(ctx.error.message, ctx.error.type);
  return ctx.result;
}
`.trim();
}

function updateOperation(model: DynamoDbModelConfig): string {
  const keyExpr = keyFromInput(model);
  return `
import { util } from '@aws-appsync/utils';

export function request(ctx) {
  const input = { ...ctx.args.input };
  const now = util.time.nowISO8601();
  const key = ${keyExpr};
  delete input.${model.pk.name};
  ${model.sk ? `delete input.${model.sk.name};` : ''}
  input.updatedAt = now;

  const sets = [];
  const values = {};
  const names = {};
  for (const [k, v] of Object.entries(input)) {
    sets.push('#' + k + ' = :' + k);
    names['#' + k] = k;
    values[':' + k] = v;
  }

  return {
    operation: 'UpdateItem',
    key: util.dynamodb.toMapValues(key),
    update: {
      expression: 'SET ' + sets.join(', '),
      expressionNames: names,
      expressionValues: util.dynamodb.toMapValues(values),
    },
  };
}

export function response(ctx) {
  if (ctx.error) util.error(ctx.error.message, ctx.error.type);
  return ctx.result;
}
`.trim();
}

function deleteOperation(model: DynamoDbModelConfig): string {
  const keyExpr = keyFromArgs(model);
  return `
import { util } from '@aws-appsync/utils';

export function request(ctx) {
  return {
    operation: 'DeleteItem',
    key: util.dynamodb.toMapValues(${keyExpr}),
  };
}

export function response(ctx) {
  if (ctx.error) util.error(ctx.error.message, ctx.error.type);
  return ctx.result;
}
`.trim();
}

function softDeleteOperation(model: DynamoDbModelConfig): string {
  const keyExpr = keyFromArgs(model);
  return `
import { util } from '@aws-appsync/utils';

export function request(ctx) {
  return {
    operation: 'UpdateItem',
    key: util.dynamodb.toMapValues(${keyExpr}),
    update: {
      expression: 'SET deletedAt = :now',
      expressionValues: util.dynamodb.toMapValues({ ':now': util.time.nowISO8601() }),
    },
  };
}

export function response(ctx) {
  if (ctx.error) util.error(ctx.error.message, ctx.error.type);
  return ctx.result;
}
`.trim();
}

function keyFromArgs(model: DynamoDbModelConfig): string {
  if (model.sk) {
    return `{ ${model.pk.name}: ctx.args.${model.pk.name} ?? ctx.args.id, ${model.sk.name}: ctx.args.${model.sk.name} }`;
  }
  return `{ ${model.pk.name}: ctx.args.${model.pk.name} ?? ctx.args.id }`;
}

function keyFromInput(model: DynamoDbModelConfig): string {
  if (model.sk) {
    return `{ ${model.pk.name}: input.${model.pk.name}, ${model.sk.name}: input.${model.sk.name} }`;
  }
  return `{ ${model.pk.name}: input.${model.pk.name} }`;
}
