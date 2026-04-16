# simple-cdk

Build on AWS without being an AWS expert.

A thin, plugin-driven layer on top of AWS CDK that gets rid of the boilerplate. Bring your own adapters or use the ones we ship — the engine never assumes anything about your domain.

## Why

Raw CDK is powerful but verbose. Amplify hides too much. simple-cdk sits in the middle: a stable engine, swappable adapters for common AWS resources, and a CLI that scaffolds the parts you'd otherwise type by hand.

## Status

Early. Pre-1.0. APIs may change.

## Packages

| Package | What it does |
|---------|--------------|
| `@simple-cdk/core` | Engine: adapter loader, lifecycle, config, types |
| `@simple-cdk/cli` | The `simple-cdk` CLI binary |
| `@simple-cdk/lambda` | Auto-discover Lambda handlers, wire IAM grants |
| `@simple-cdk/dynamodb` | Model-driven DynamoDB table generation |
| `@simple-cdk/appsync` | AppSync GraphQL API + auto CRUD resolvers |
| `@simple-cdk/cognito` | Cognito user pools + triggers |

## Examples

See [`examples/`](./examples) for working projects, ranging from minimal to multi-tenant.

## License

MIT
