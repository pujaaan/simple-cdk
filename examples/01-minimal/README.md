# Example 01: Minimal

The smallest useful simple-cdk app: one Lambda, one AppSync query.

## What it shows

- Discovering a Lambda handler from `backend/functions/<name>/handler.ts`
- Wiring it to a GraphQL field via the `appSyncAdapter`
- No database, no auth, no Cognito, just two adapters

## Run

```bash
npm install                  # at the monorepo root
npm run build                # at the monorepo root
cd examples/01-minimal
npm run list                 # see what each adapter discovered
npm run synth                # generate CloudFormation
npm run deploy               # push to AWS (requires AWS credentials)
```

## Files

| File | Purpose |
|------|---------|
| `simple-cdk.config.ts` | App config: stages, adapters, resolvers |
| `schema.graphql` | GraphQL schema |
| `backend/functions/hello/handler.ts` | Lambda implementation |

## Adding a new query

1. Create `backend/functions/echo/handler.ts`
2. Add the type to `schema.graphql`
3. Add a resolver in the config:

```ts
{ typeName: 'Query', fieldName: 'echo', source: { kind: 'lambda', lambdaName: 'echo' } }
```

That's it. No CDK constructs, no `new NodejsFunction()`, no resolver wiring by hand.
