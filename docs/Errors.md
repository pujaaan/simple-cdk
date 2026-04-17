# Errors

simple-cdk distinguishes two kinds of errors when printing:

- **User errors** — something about your config, files, or CLI arguments is wrong. Printed as a clean block with a `hint:` line and no stack trace. Exit code `1`.
- **Internal errors** — a bug in simple-cdk itself. Printed with a banner asking you to [file an issue](https://github.com/pujaaan/simple-cdk/issues), plus the full stack. Exit code `2`.

If you see an "internal error" banner, please report it with your `simple-cdk.config.ts` and the command you ran.

The `cdk` CLI's own errors (failed deploys, quota limits, IAM denials, region mismatches) are forwarded verbatim from the `cdk` subprocess — simple-cdk does not re-wrap them, because CDK has already printed the relevant detail. The child's exit code is forwarded as-is.

## Debug mode

Set `SIMPLE_CDK_DEBUG=1` to include the underlying stack and any wrapped `cause` chain in the friendly error block. Useful for filing bug reports or diagnosing obscure config-load failures.

```bash
SIMPLE_CDK_DEBUG=1 simple-cdk list
```

## Error codes

Every user-facing error carries a `code` that is shown at the bottom of the error block. Use it to jump to the right section below.

| Code | When it fires | Typical fix |
|---|---|---|
| `CONFIG_NOT_FOUND` | No `simple-cdk.config.ts` (or `.mts`/`.js`/`.mjs`) in the current directory and no `--config` flag. | Run `simple-cdk init` to scaffold one, or pass `--config <path>`. |
| `CONFIG_INVALID` | The config failed validation (missing app name, bad region format, unknown stage, malformed adapter entry, etc.). | Read the list of issues under the message — each one has its own hint. Fix them all in one pass and re-run. |
| `RESOURCE_NOT_FOUND` | A `getLambdaFunction("foo")`-style lookup didn't find a resource with that name. | The error lists the available names. Either rename your reference or create the missing file (`backend/functions/foo/handler.ts`, `backend/models/foo.model.ts`, etc.). |
| `ADAPTER_NOT_RUN` | `getRdsInstance(ctx)` / `getUserPool(ctx)` / `getAppSyncApi(ctx)` was called but the relevant adapter isn't in `config.adapters`. | Add the adapter to your config. The hint names the exact factory to call. |
| `ADAPTER_ORDER` | A wire-phase lookup found the resource but it hadn't been registered yet — typically because the adapters are listed in the wrong order. | Move the dependency adapter earlier in the `adapters` array. E.g. list `lambdaAdapter()` before `dynamoDbAdapter()` so stream targets can find their Lambdas. |
| `DISCOVERY_FAILED` | At least one file (model, function config, trigger) failed to load during discovery. `deploy`, `synth`, `diff`, and `destroy` refuse to continue. | Run `simple-cdk list` to see the full report. For each listed file, fix the syntax error, missing import, or bad export. |
| `WIRE_REFERENCE` | A wire-time name reference (e.g. `streamTargets`, an AppSync resolver `source.lambdaName`) points at something that doesn't exist. | The error lists what *does* exist — rename your reference or create the missing resource. |
| `USER_INPUT` | CLI argument is missing or invalid (wrong `create` kind, unknown verb, unrecognized Cognito trigger name, invalid stage choice). | Follow the hint — it spells out the accepted values. |

## Common scenarios

### "DynamoDB table \"foo\" was not found. available: orders, users"

You called `getDynamoTable(ctx, 'foo')` from a wire hook. Either the model file is named differently (check `backend/models/foo.model.ts`), or the `name` field inside the model config overrides the file stem.

### "AppSync API was requested but the appsync adapter is not in your config"

Add `appSyncAdapter({ schemaFile: 'schema.graphql' })` to `config.adapters`. Make sure you're **calling** the factory (note the trailing parentheses) — passing the function reference is a common mistake and produces a different error (`adapter ... declares no lifecycle hooks`).

### "Lambda \"on-todo-change\" was not found … DynamoDB table \"todo\" declares streamTargets"

Create `backend/functions/on-todo-change/handler.ts` (or rename your `streamTargets` entry), then re-deploy.

### "Cognito authorization on appSyncAdapter({ authorization }) is not supported"

The `{ kind: 'cognito' }` shortcut was removed because it couldn't reach the user pool construct cleanly. Use `{ kind: 'iam' }` or `{ kind: 'api-key' }` here; for a Cognito-backed GraphQL API, write a small wiring adapter that calls `getUserPool(ctx)` and configures AppSync authorization yourself.

### "config is invalid (N issues)"

Validation runs synchronously inside `defineConfig`. Every issue reported in one pass — fix them all and re-run. Common causes:

- `app` name contains spaces, dots, or slashes
- `region` doesn't look like an AWS region (expected `us-east-1`, `eu-west-2`, etc.)
- `account` isn't 12 digits
- `logRetentionDays` isn't one of CloudWatch's allowed values (1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1096, 1827, 2192, 2557, 2922, 3288, 3653)
- `defaultStage` references a stage that isn't defined
- Duplicate adapter names in `adapters[]`
- Passing an adapter factory (`lambdaAdapter`) instead of calling it (`lambdaAdapter()`)

## Design principle

simple-cdk treats every error thrown from its own engine or adapters as user-facing and wraps them in `SimpleCdkError`. Raw `Error` surfacing to the user means the engine has a bug — please file one. AWS CDK errors (from `cdk deploy` and friends) pass through untouched because CDK has already formatted them.
