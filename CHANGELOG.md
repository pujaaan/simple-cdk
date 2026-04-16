# Changelog

All notable changes are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project follows [SemVer](https://semver.org/) (pre-1.0 means breaking changes can land in any release).

## [Unreleased]

## [0.0.1] - 2026-04-16

Initial release.

### Added

- **`@simple-cdk/core`**: engine, lifecycle (discover → register → wire), config resolver, filesystem discovery helper, public types
- **`@simple-cdk/cli`**: `simple-cdk` binary with `list`, `synth`, `diff`, `deploy`, `destroy` commands; passthrough to the underlying `cdk` CLI via `--`
- **`@simple-cdk/lambda`**: auto-discover Lambda handlers from `backend/functions/<name>/handler.ts`, optional sibling `config.ts`, `getLambdaFunction` cross-adapter lookup
- **`@simple-cdk/dynamodb`**: auto-discover model files (`*.model.ts`), create tables with GSIs, streams, TTL, point-in-time recovery, `getDynamoTable` lookup
- **`@simple-cdk/appsync`**: GraphQL API creation, Lambda + DynamoDB data sources, auto-CRUD generator (get/list/create/update/delete), pluggable auth pipeline, manual resolver wiring
- **`@simple-cdk/cognito`**: user pool + app client, auto-discover Lambda triggers from `backend/triggers/<trigger-name>/handler.ts`, `getUserPool` lookup
- Two working examples: `01-minimal` (Lambda + AppSync) and `02-with-models` (DynamoDB auto-CRUD)
- Wiki-style docs: getting-started, architecture, extending, plus per-adapter pages

### Known gaps (planned)

- No `@simple-cdk/rds` adapter yet. Use raw CDK in a custom adapter (see [extending docs](https://github.com/pujaaan/simple-cdk/blob/main/docs/Extending.md))
- No first-class DynamoDB stream subscriber. Declare `stream: '...'` on the table and wire the consumer Lambda manually for now
- No CloudFormation logical-ID preservation map. Fresh deploys only; safe migration of existing AWS resources comes in a later release
- No schema generation from models. Write `schema.graphql` by hand
- No interactive scaffolding (`simple-cdk create model <name>`)
