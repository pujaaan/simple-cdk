import type { DynamoDbModelConfig } from '@simple-cdk/dynamodb';

const todo: DynamoDbModelConfig = {
  name: 'todo',
  pk: { name: 'id', type: 'string' },
  pointInTimeRecovery: true,
};

export default todo;
