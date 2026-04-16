# Example 02: With Models

DynamoDB-backed model with auto-generated CRUD resolvers. No resolver code, no table boilerplate.

## What it shows

- Discovering a model from `backend/models/<name>.model.ts`
- Creating a DynamoDB table from the model config
- Auto-generating five resolvers (`getTodo`, `listTodos`, `createTodo`, `updateTodo`, `deleteTodo`) from the model
- A schema that matches the auto-generated field names

## Run

```bash
npm install                  # at the monorepo root
npm run build                # at the monorepo root
cd examples/02-with-models
npm run list
npm run synth
npm run deploy
```

## Adding a new model

1. Drop a `<name>.model.ts` into `backend/models/`
2. Add matching types + queries + mutations to `schema.graphql`
3. Re-run `simple-cdk deploy`

The CRUD field names are derived from the model name: `getX`, `listXs`, `createX`, `updateX`, `deleteX`. Match those exactly in your schema.

## Out of CRUD's reach?

Switch to a manual resolver for that field. Point at a JS file with your own request/response code:

```ts
appSyncAdapter({
  schemaFile: 'schema.graphql',
  generateCrud: { models: ['todo'], operations: ['get', 'list', 'create'] },
  resolvers: [
    {
      typeName: 'Mutation',
      fieldName: 'completeTodo',
      source: { kind: 'dynamodb', tableName: 'todo', jsFile: 'resolvers/complete-todo.js' },
    },
  ],
});
```
