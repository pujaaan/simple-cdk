# Changelog

All notable changes are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project follows [SemVer](https://semver.org/) (pre-1.0 means breaking changes can land in any release).

## [Unreleased]

## [4.2.1] - 2026-04-16

### Fixed

- **CLI deploy/diff formatter no longer paints esbuild + npm stderr chatter red.** The v4.1.1 fix colored every unmatched stderr line red to surface genuine `cdk` errors — but esbuild's asset-bundling progress (`...<hash>-building/index.js  N kb`) and npm's install output (`added N packages`, `audited N packages`, `found 0 vulnerabilities`, funding / deprecation notices) also stream on stderr, so they all came through red. `shouldHide` now recognizes those known-noisy shapes and suppresses them; genuine unmatched stderr (real CDK errors) still renders red.

## [4.2.0] - 2026-04-16

### Added

- **`@simple-cdk/appsync`**: **Cognito authorization on `appSyncAdapter({ authorization })`** — the `{ kind: 'cognito' }` variant is now functional. Pass `userPool` as an `IUserPool` directly or as a `(ctx) => IUserPool` resolver (the usual form is `userPool: (ctx) => getUserPool(ctx)`), plus optional `defaultAction` (`ALLOW`/`DENY`, default `ALLOW`) and `appIdClientRegex`. Unblocks Cognito-backed APIs without the escape-hatch-via-wiring workaround — which was never actually viable because `defaultAuthorization` is locked at `GraphqlApi` construction.
  ```ts
  import { getUserPool } from '@simple-cdk/cognito';
  appSyncAdapter({
    schemaFile: 'schema.graphql',
    authorization: { kind: 'cognito', userPool: (ctx) => getUserPool(ctx) },
  });
  ```
- **`@simple-cdk/appsync`**: **lower-level building blocks exported** — `buildApi`, `getBuiltApi`, `attachCrudResolvers`, `attachManualResolvers`, and the `BuiltApi` type are now part of the public API. Use these to build a custom adapter that creates the `GraphqlApi` itself (for props the adapter doesn't surface) while reusing the CRUD + manual-resolver pipelines. Most consumers should still use `appSyncAdapter()`.
- **`@simple-cdk/lambda`** and **`@simple-cdk/appsync`**: `stack?` on adapter options now accepts `Stack | ((ctx) => Stack)`. Use the callback form to bind to a `Stack` another adapter registered earlier via `ctx.stack(name)` — late-binding avoids requiring the consumer to materialize the `Stack` at config-eval time.

### Changed

- **`AuthorizationMode`** `{ kind: 'cognito' }` variant shape changed from `{ userPoolName: string }` (never functional — always threw) to `{ userPool: IUserPool | (ctx) => IUserPool; defaultAction?; appIdClientRegex? }`. Technically a type-level break, but no consumer code could have been using the old shape successfully.

## [4.1.1] - 2026-04-16

### Fixed

- **CLI deploy/diff formatter no longer swallows CDK errors as dim gray.** `renderDeploy` and `renderDiff` now tag each line with its source stream; unmatched `stderr` lines (e.g. `cdk deploy`'s "Since this app includes more than a single stack, specify which stacks to use…") are printed to `stderr` in red instead of being dimmed alongside harmless stdout chatter. Non-error stdout lines still render dim as before.

## [4.1.0] - 2026-04-16

### Added

- **`@simple-cdk/appsync`**: **dynamic stash expressions**. Stash values can now be `{ code: 'ctx.identity.claims["custom:tenantId"]' }` instead of JSON literals — the expression is emitted verbatim into the resolver JS, so auth pipelines can pull per-request values out of `ctx.identity` / `ctx.args` / `ctx.stash`. Unblocks tenant-isolation patterns without forking the adapter or abandoning `generateCrud`.
  - `StashValue = StashLiteral | { code: string }` (new)
  - `ResolverSpec.stashBefore` and `CrudGenSpec.stashBeforeFor` accept `StashValue`.
  - `ResolverSpec.stashCode?: string` and `CrudGenSpec.stashCodeFor?: (op, model) => string` — raw resolver-side JS inserted before the stash-seed block for multi-statement preambles (JWT parsing, composite keys, early-unauthorized checks).
  - Example:
    ```ts
    appSyncAdapter({
      generateCrud: {
        models: 'all',
        stashBeforeFor: () => ({
          tenantId: { code: 'ctx.identity.claims["custom:tenantId"]' },
          userId:   { code: 'ctx.identity.sub' },
        }),
      },
    })
    ```
- **docs**: [Adopting an existing deployment](docs/Adopting.md) — first-class brownfield adoption guide covering every construct-id and physical-name override per adapter, inventory → diff → deploy workflow, caveats, and a checklist. Linked from sidebar and home.

### Changed

- `StashLiteral` now permits `null`, arrays, and nested objects (still JSON-encoded) in addition to the previous `string | number | boolean`. Values that look like `{ code: string }` are treated as dynamic expressions, not literals — if you need the literal object `{ code: "foo" }` in the stash, wrap it as `{ value: { code: "foo" } }` or use `stashCode` to set it manually.

## [4.0.0] - 2026-04-16

### Changed

- **Error handling overhaul.** Every user-facing error now flows through a single `SimpleCdkError` class with an actionable `hint:` line and no stack trace; unexpected errors get an "internal error — please report" banner. The `cdk` subprocess's own errors pass through untouched so AWS errors are never double-wrapped. Set `SIMPLE_CDK_DEBUG=1` for full stack + cause chain.
- **`defineConfig` now validates synchronously** — broken configs fail at `simple-cdk list` instead of deep in the engine at deploy time. All issues are collected and reported in one pass. Validates app name, stage names, region format, 12-digit accounts, `removalPolicy` enum, CloudWatch-allowed `logRetentionDays` values, duplicate adapter names, and adapters with no lifecycle hooks.
- **Cross-adapter lookup helpers are uniform.** `getLambdaFunction`, `getDynamoTable`, `getUserPool`, `getUserPoolClient`, `getCognitoTrigger`, `getRdsInstance`, `getRdsSecret`, `getRdsVpc`, `getRdsSecurityGroup`, `getAppSyncApi` all list what *was* discovered when a lookup misses, and distinguish `RESOURCE_NOT_FOUND` / `ADAPTER_NOT_RUN` / `ADAPTER_ORDER` with targeted hints.
- **Discovery errors are no longer swallowed.** Broken `*.model.ts`, broken function `config.ts`, function folders with no handler, and unknown Cognito trigger folders are collected into a `DiscoveryReport` surfaced by `simple-cdk list`. Fatal discovery errors block `synth` / `deploy` / `diff` / `destroy`.

### Added

- **`@simple-cdk/core`**: `SimpleCdkError`, `isSimpleCdkError`, `resourceNotFound`, `requireResource`, `adapterNotRun`, `adapterOrderError`, `createDiscoveryReport`, plus `DiscoveryIssue` and `DiscoveryReport` types. `DiscoveryContext` gains a `report` field that adapters use to record per-file issues.
- **`@simple-cdk/core`**: `Engine.discover()` returns the per-adapter resources without running synth, and `Engine.report` exposes the collected issues. Used by `simple-cdk list` to run discovery once and surface both resources and issues.
- **docs**: [Errors.md](docs/Errors.md) (error-code reference + common scenarios) and [Ordering.md](docs/Ordering.md) (wire-phase ordering invariant + rules of thumb).

### Breaking

- Configs that were technically invalid but slipping through (bad region format, non-CloudWatch `logRetentionDays` values, missing required fields, duplicate adapter names) now fail at `defineConfig` instead of later. Valid configs are unchanged.
- `appSyncAdapter({ generateCrud: { models: [...] } })` with a name that isn't a discovered DynamoDB model now throws `RESOURCE_NOT_FOUND` instead of warning-and-skipping. The `'all'` path is unchanged.
- The `{ kind: 'cognito' }` variant of `appSyncAdapter({ authorization })` (which was never functional — it threw unconditionally) now throws a clearer `USER_INPUT` error pointing users at `getUserPool(ctx)` for custom wiring.
- Error message strings across the engine and adapters are rewritten. Anyone string-matching error text will need to switch to the `code` field on `SimpleCdkError`.

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
