import { defineConfig } from '@simple-cdk/core';
import { lambdaAdapter } from '@simple-cdk/lambda';
import { appSyncAdapter } from '@simple-cdk/appsync';

/**
 * Minimal example: one Lambda + one AppSync resolver. No database, no auth.
 * Run `simple-cdk list` to see what gets discovered, `simple-cdk synth` to
 * build the CloudFormation, `simple-cdk deploy` to push to AWS.
 */
export default defineConfig({
  app: 'minimal',
  defaultStage: 'dev',
  stages: {
    dev: {
      region: process.env.AWS_REGION ?? 'us-east-1',
      removalPolicy: 'destroy',
      logRetentionDays: 7,
    },
  },
  adapters: [
    lambdaAdapter({ dir: 'backend/functions' }),
    appSyncAdapter({
      schemaFile: 'schema.graphql',
      resolvers: [
        {
          typeName: 'Query',
          fieldName: 'hello',
          source: { kind: 'lambda', lambdaName: 'hello' },
        },
      ],
    }),
  ],
});
