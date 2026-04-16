import { defineConfig } from '@simple-cdk/core';
import { dynamoDbAdapter } from '@simple-cdk/dynamodb';
import { appSyncAdapter } from '@simple-cdk/appsync';

/**
 * Models example: a single Todo model gets a DynamoDB table and a full
 * set of CRUD resolvers wired into AppSync. Zero handler code required.
 *
 * The schema must declare matching fields (getTodo, listTodos, createTodo,
 * updateTodo, deleteTodo) — see schema.graphql.
 */
export default defineConfig({
  app: 'todos',
  defaultStage: 'dev',
  stages: {
    dev: {
      region: process.env.AWS_REGION ?? 'us-east-1',
      removalPolicy: 'destroy',
      logRetentionDays: 7,
    },
  },
  adapters: [
    dynamoDbAdapter({ dir: 'backend/models' }),
    appSyncAdapter({
      schemaFile: 'schema.graphql',
      generateCrud: { models: 'all', softDelete: false },
    }),
  ],
});
