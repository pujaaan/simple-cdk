# Adopting an existing deployment

You already have a stack deployed — by hand, via Terraform, via the Console, via Amplify, via a different CDK app. You want simple-cdk to take over **without delete-and-recreate**. This guide walks through matching the existing CloudFormation logical IDs so `diff` shows no replacements.

> simple-cdk is designed to be adopted. Every adapter exposes construct-id and name overrides specifically for this case. If you hit a wall, there's almost certainly a knob — check the [catalog](#override-catalog) below or ask in an issue.

## The strategy

1. **Inventory.** For each resource you're adopting, write down:
   - The CloudFormation stack name (exact, e.g. `myapp-prod-api`)
   - The construct's logical ID inside that stack (e.g. `Api`, `Table`, `UserPool`)
   - The resource's physical name where relevant (table name, user pool name, RDS identifier, secret ARN)
2. **Configure overrides.** In your `simple-cdk.config.ts`, pass the matching `stackId` / `*ConstructId` / `*Name` values to each adapter (see [Override catalog](#override-catalog)).
3. **Diff before deploy.** `simple-cdk synth && simple-cdk diff --stage <name>`. You want **zero** add/delete pairs for the same resource type. Every add+delete pair that names the same AWS type is a logical-ID mismatch — fix the override and re-diff.
4. **Deploy.** `simple-cdk deploy --stage <name>`. CloudFormation will update in place.

## How to find existing logical IDs

**From the AWS Console:** open CloudFormation → your stack → **Resources** tab. The "Logical ID" column is what you need.

**From the CLI:**

```bash
aws cloudformation list-stack-resources --stack-name myapp-prod-api \
  --query 'StackResourceSummaries[].[LogicalResourceId,ResourceType,PhysicalResourceId]' \
  --output table
```

**From your existing CDK app:** if you deployed via another CDK app, synth it (`cdk synth --no-staging > template.json`) and grep the `Resources:` map.

## Override catalog

Every adapter supports overriding the stack name/ID. Each adapter's top-level construct(s) can also be pinned to a verbatim logical ID.

| Adapter | Stack control | Construct ID overrides | Physical name overrides |
|---|---|---|---|
| `@simple-cdk/lambda` | `stackName` (default: `lambda`), `stackId` (verbatim CF id) | `constructId` per-function (set in `backend/functions/<name>/config.ts`) | — |
| `@simple-cdk/dynamodb` | `stackName` (default: `data`), `stackId` | `constructId` per-model (set on the model config) | Table name is always `<app>-<stage>-<model>` (convention) — override via [custom adapter](Extending.md) if non-standard |
| `@simple-cdk/appsync` | `stackName` (default: `api`), `stackId` | `apiConstructId` (default: `Api`) | `apiName` (default: `<app>-<stage>-api`) |
| `@simple-cdk/cognito` | `stackName` (default: `auth`), `stackId` | `userPoolConstructId`, `clientConstructId`, `triggerConstructIds: { 'pre-sign-up': 'MyCustomId', ... }` | `userPoolName` (default: `<app>-<stage>-users`), `clientName` (default: `web`) |
| `@simple-cdk/rds` | `stackName` (default: `data`), `stackId` | `instanceConstructId` (default: `DbInstance`) | `instanceIdentifier`, `databaseName`, `secretName` |
| `@simple-cdk/outputs` | `stackName` (default: `outputs`), `stackId` | `parameterConstructId` (default: `AppOutputs`) | `parameterName` (default: `/<app>/<stage>/outputs`) |

### `stackName` vs `stackId`

- **`stackName: 'api'`** → CloudFormation stack is named `<app>-<stage>-api` (the default convention).
- **`stackId: 'my-existing-stack-name'`** → CloudFormation stack is named exactly `my-existing-stack-name`. No prefix. Use this when the existing stack doesn't follow the `<app>-<stage>-<part>` shape.

You can also pass your own pre-built `Stack` via `stack: myStack` — takes precedence over both.

## Concrete examples

### Cognito with an existing user pool

Existing stack has:
- Stack name: `auth-prod` (no app prefix)
- User pool logical ID: `MyOldUserPool`
- Client logical ID: `MyWebClient`
- Pool physical name: `production-users`

```ts
cognitoAdapter({
  stackId: 'auth-prod',             // stack name verbatim
  userPoolConstructId: 'MyOldUserPool',
  clientConstructId: 'MyWebClient',
  userPoolName: 'production-users',
})
```

### Adopting a Cognito trigger Lambda

Cognito triggers are created as Lambdas inside the cognito adapter's stack. If your existing deployment has a pre-sign-up trigger at logical ID `PreSignUpFn`:

```ts
cognitoAdapter({
  triggerConstructIds: {
    'pre-sign-up': 'PreSignUpFn',
  },
})
```

### RDS with an existing secret and instance

```ts
import { rdsAdapter } from '@simple-cdk/rds';
import { aws_rds as rds } from 'aws-cdk-lib';

rdsAdapter({
  engine: 'postgres',
  stackId: 'legacy-db-stack',
  instanceConstructId: 'PrimaryDb',
  instanceIdentifier: 'prod-primary',   // RDS physical id
  databaseName: 'appdata',
  credentials: rds.Credentials.fromSecret(
    secretsmanager.Secret.fromSecretNameV2(stack, 'DbSecret', 'prod/rds/master'),
  ),
})
```

### AppSync API with a pinned logical ID

```ts
appSyncAdapter({
  schemaFile: 'schema.graphql',
  stackId: 'my-app-api',
  apiConstructId: 'GraphqlApi',          // was: `Api`
  apiName: 'my-app-prod-graphql',
})
```

## Caveats

- **CloudFormation cannot rename logical IDs in place.** Every missed override = one resource deleted + one recreated. If `diff` shows both, your override is wrong — don't deploy.
- **Some resources resist in-place adoption.** IAM roles generated by other tools, Cognito trigger ARNs, custom resources — if the other tool put a policy / permission / dependency on the old resource, the new CDK-managed version may need a transition deploy (two deploys: one to add the new alongside, one to remove the old reference).
- **Secrets:** if you're adopting an RDS instance with a Secrets Manager secret that already exists, don't let simple-cdk create a new one. Pass `credentials: rds.Credentials.fromSecret(existing)` explicitly.
- **Lambda `code` changes will always show as a diff** because simple-cdk bundles via esbuild. That's expected and safe — the deploy updates the function code, nothing else.
- **Tags:** simple-cdk applies `app` and `stage` tags at the stack level. If your existing stack has different tags, diff will want to add them. Harmless; allow it.
- **Physical names can't be renamed** without replacement. If your existing table is named `MyTable` and simple-cdk's convention would generate `myapp-prod-todo`, you have two choices: accept the convention for new resources and leave the existing table alone via a custom adapter, or override the stack to pin the physical name.

## When overrides aren't enough

If the resource shape itself diverges too far from what the adapter produces (custom VPC topology, non-standard Cognito password policy, unusual GSI layout), skip the built-in adapter and write a small custom one — it's three functions (`discover` / `register` / `wire`), and the engine handles the stage plumbing. See [Extending](Extending.md).

## Checklist

- [ ] Inventoried every stack + construct ID I care about
- [ ] Set `stackId` on adapters where the existing stack name doesn't follow `<app>-<stage>-<part>`
- [ ] Set `*ConstructId` for every construct I'm adopting
- [ ] Set physical names (`apiName`, `userPoolName`, `instanceIdentifier`, `secretName`, etc.) to match
- [ ] `simple-cdk diff --stage <name>` — zero add+delete pairs for the same resource type
- [ ] Backed up the current state (RDS snapshot, DynamoDB backup) before the first deploy
- [ ] First deploy in a non-prod stage if possible

If the diff is clean, `deploy` is boring.
