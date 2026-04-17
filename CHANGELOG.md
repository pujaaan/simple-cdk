# Changelog

All notable changes are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project follows [SemVer](https://semver.org/) (pre-1.0 means breaking changes can land in any release).

## [Unreleased]

## [2.0.0] - 2026-04-16

### Added

- **`@simple-cdk/rds`**: single-instance RDS adapter (Postgres or MySQL) with isolated-subnet VPC and managed Secrets Manager secret; `getRdsInstance` / `getRdsSecret` / `getRdsVpc` / `getRdsSecurityGroup` lookups. No automatic IAM or network wiring — consumers grant access explicitly to preserve the "no surprise permissions" posture.
- **`@simple-cdk/outputs`**: bundles arbitrary values into one SSM `String` parameter (default `/<app>/<stage>/outputs`) so frontends can read the whole config in a single call. Also emits per-key `CfnOutput`s by default.
- **`@simple-cdk/dynamodb`**: `streamTargets` on a model config — name one or more Lambdas and the wire phase attaches a `DynamoEventSource` to each. `streamTargetOptions` surfaces the common `EventSourceMapping` knobs (starting position, batch size, retry, parallelization, batch-item failures).
- **`@simple-cdk/core`**: `standardLayout()` preset exposing a nested `backend/` layout (auth, tables, functions, api). Opt-in — adapter defaults remain flat.
- **`@simple-cdk/core`**: `StackOptions` on `ctx.stack(name, opts?)` with an `id` override to pin a stack's CloudFormation logical ID verbatim. Surfaced by the rds, outputs, dynamodb, and cognito adapters as `stackId`.
- **`simple-cdk init`**: now prompts for `@simple-cdk/rds` (with Postgres/MySQL engine choice) and `@simple-cdk/outputs`, installs the right packages, and scaffolds a working starter config line.
- **`simple-cdk create <kind> <name>`**: new scaffolding subcommand for `model`, `function`, and `trigger`. Validates Cognito trigger names; supports `--dir` to override the default path.
- **`simple-cdk generate-schema`**: emit a `schema.graphql` covering `type <Model>`, `type <Model>Connection`, `Create<Model>Input` / `Update<Model>Input`, and Query/Mutation fields from every discovered DynamoDB model. Pair with `appSyncAdapter({ generateCrud: { models: 'all' } })` to wire the emitted operations to auto-CRUD resolvers. `--out <path>` overrides the target file.
- **`@simple-cdk/dynamodb`**: new `attributes` field on `DynamoDbModelConfig` — declare non-key fields with GraphQL scalar types (`ID`, `String`, `Int`, `Float`, `Boolean`, `AWSDateTime`, `AWSJSON`) for the schema generator. DynamoDB itself remains schemaless. Exports `generateGraphQLSchema()` as a library entry point.
- **Construct ID overrides** for primary constructs: `apiConstructId` (appsync), `clientConstructId` + `triggerConstructIds` (cognito), `parameterConstructId` (outputs). Combined with the existing `constructId` on Lambda and DynamoDB and `instanceConstructId` on RDS, every top-level adapter construct can now be pinned to a verbatim CloudFormation logical ID — making it safe to adopt simple-cdk over an existing stack without delete-and-recreate.

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

- All gaps listed at 0.0.1 — logical-ID preservation for every primary construct, schema generation from models, `simple-cdk create`, and init coverage for rds/outputs — are addressed in Unreleased. Remaining: GSI-aware `by<Gsi>` query fields in schema generation, and reversible stack-id renames (CF logical-ID preservation is still opt-in per construct rather than automatic).
