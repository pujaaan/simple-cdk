# Adapter ordering

simple-cdk runs adapters through three phases in a fixed sequence, and the order inside `config.adapters` matters within each phase.

```
for each adapter in order:  discover()   → collect resources from disk
for each adapter in order:  register()   → create CDK constructs
for each adapter in order:  wire()       → cross-adapter references
```

All three phases traverse the array in the order you wrote. So if `adapterB.wire()` needs to look up a resource registered by `adapterA`, then `adapterA` must appear **before** `adapterB` in the array.

## The invariant

**All `getX()` helpers are wire-phase only, and the adapter being queried must appear earlier in the `adapters[]` array.**

This is enforced with errors, not with reordering. If the ordering is wrong, the lookup throws a `SimpleCdkError` with code `ADAPTER_ORDER` and a hint telling you which adapter to move.

## Rules of thumb

- **`lambdaAdapter()` goes first** when other adapters reference Lambdas (AppSync resolvers, DynamoDB stream targets, Cognito triggers own their triggers so this doesn't apply there).
- **`dynamoDbAdapter()` goes before `appSyncAdapter()`** if you use `generateCrud` or reference tables from resolver sources.
- **`outputsAdapter()` goes last.** It runs in the wire phase and collects values from every other adapter.
- **Custom wiring adapters go after the adapters they reference.** A `lambda-dynamodb` wiring adapter with a `wire:` hook that calls `getLambdaFunction(ctx, 'create-todo')` and `getDynamoTable(ctx, 'todo')` must appear after both `lambdaAdapter()` and `dynamoDbAdapter()`.

## Canonical order

This order works for most projects and is what `simple-cdk init` scaffolds:

```ts
adapters: [
  lambdaAdapter(),
  dynamoDbAdapter(),
  cognitoAdapter(),
  rdsAdapter({ engine: 'postgres' }),
  appSyncAdapter({ schemaFile: 'schema.graphql' }),
  // your custom wiring adapters
  outputsAdapter({ collect: (ctx) => ({ ... }) }),
],
```

## If you see `ADAPTER_ORDER`

```
error: Lambda "create-todo" was requested before the lambda adapter ran.
  hint: list lambdaAdapter() before the adapter that calls getLambdaFunction().
```

Swap the adapters' positions in `config.adapters`. No other change is needed.

## Discovery failures block deploy

If discovery produces errors (a model file with a syntax error, a function folder with no handler, a trigger folder with an unrecognized name), the engine refuses to `synth`/`deploy`/`diff`/`destroy`. Run `simple-cdk list` to see the full report, fix the listed files, then re-run.

Warnings (non-fatal discovery issues, like a trigger folder with an unknown name) are surfaced by `list` but don't block deploy.
