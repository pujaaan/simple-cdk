# simple-cdk

The CLI for [simple-cdk](https://github.com/pujaaan/simple-cdk). Wraps the AWS CDK CLI with stage-aware commands and an auto-discovery `list` view.

## Install

```bash
npm install simple-cdk aws-cdk-lib constructs
```

This installs the `simple-cdk` binary.

## Commands

```bash
simple-cdk list                            # show what each adapter discovered
simple-cdk synth                           # synthesize CloudFormation locally
simple-cdk diff --stage dev                # diff against deployed stack
simple-cdk deploy --stage prod             # deploy to AWS
simple-cdk destroy --stage dev             # tear it down
simple-cdk help

# forward extra args to the underlying cdk CLI:
simple-cdk deploy --stage prod -- --require-approval never
```

## Requires

- Node 22+
- A `simple-cdk.config.ts` (or `.js`) at the project root

Full docs at the [main repo](https://github.com/pujaaan/simple-cdk).
