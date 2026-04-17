# Changelog

All notable changes are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project follows [SemVer](https://semver.org/) (pre-1.0 means breaking changes can land in any release).

## [Unreleased]

### Added

- **`@simple-cdk/rds`**: single-instance RDS adapter (Postgres or MySQL) with isolated-subnet VPC and managed Secrets Manager secret; `getRdsInstance` / `getRdsSecret` / `getRdsVpc` / `getRdsSecurityGroup` lookups. No automatic IAM or network wiring — consumers grant access explicitly to preserve the "no surprise permissions" posture.
- **`@simple-cdk/outputs`**: bundles arbitrary values into one SSM `String` parameter (default `/<app>/<stage>/outputs`) so frontends can read the whole config in a single call. Also emits per-key `CfnOutput`s by default.
- **`@simple-cdk/dynamodb`**: `streamTargets` on a model config — name one or more Lambdas and the wire phase attaches a `DynamoEventSource` to each. `streamTargetOptions` surfaces the common `EventSourceMapping` knobs (starting position, batch size, retry, parallelization, batch-item failures).
- **`@simple-cdk/core`**: `standardLayout()` preset exposing a nested `backend/` layout (auth, tables, functions, api). Opt-in — adapter defaults remain flat.
- **`@simple-cdk/core`**: `StackOptions` on `ctx.stack(name, opts?)` with an `id` override to pin a stack's CloudFormation logical ID verbatim. Surfaced by the rds, outputs, dynamodb, and cognito adapters as `stackId`.

## [0.0.1] - 2026-04-16

Initial release.

### Added

- **`@simple-cdk/core`**: engine, lifecycle (discover → register → wire), config resolver, filesystem discovery helper, public types
- **`simple-cdk`**: the `simple-cdk` CLI with `list`, `synth`, `diff`, `deploy`, `destroy` commands; passthrough to the underlying `cdk` CLI via `--`
- **`@simple-cdk/lambda`**: auto-discover Lambda handlers from `backend/functions/<name>/handler.ts`, optional sibling `config.ts`, `getLambdaFunction` cross-adapter lookup
- **`@simple-cdk/dynamodb`**: auto-discover model files (`*.model.ts`), create tables with GSIs, streams, TTL, point-in-time recovery, `getDynamoTable` lookup
- **`@simple-cdk/appsync`**: GraphQL API creation, Lambda + DynamoDB data sources, auto-CRUD generator (get/list/create/update/delete), pluggable auth pipeline, manual resolver wiring
- **`@simple-cdk/cognito`**: user pool + app client, auto-discover Lambda triggers from `backend/triggers/<trigger-name>/handler.ts`, `getUserPool` lookup
- Two working examples: `01-minimal` (Lambda + AppSync) and `02-with-models` (DynamoDB auto-CRUD)
- Wiki-style docs: getting-started, architecture, extending, plus per-adapter pages

### Known gaps (planned)

- No CloudFormation logical-ID preservation map. Fresh deploys only; safe migration of existing AWS resources comes in a later release (partial: `stackId` on the stack factory, `constructId` on DynamoDB models)
- No schema generation from models. Write `schema.graphql` by hand
- No interactive scaffolding (`simple-cdk create model <name>`)
- `init` doesn't prompt for `@simple-cdk/rds` or `@simple-cdk/outputs` yet — install and wire them manually for now
