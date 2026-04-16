export function helpCommand(): void {
  console.log(`simple-cdk: build on AWS without being an AWS expert.

Usage:
  simple-cdk <command> [options]

Commands:
  init                 Scaffold a new project (or add simple-cdk to an existing one)
  list                 Show what each adapter would discover (no synth)
  synth                Synthesize the CloudFormation templates
  diff                 Diff against the deployed stack(s)
  deploy               Deploy stacks for the chosen stage
  destroy              Tear down stacks for the chosen stage
  help                 Show this message

Common options:
  --stage <name>       Stage to use (if omitted, prompts when multiple stages exist)
  --all                Run for every stage in the config (sequentially)
  --verbose            Show raw cdk output (disables the table formatter)
  --config <path>      Path to your simple-cdk config (default: simple-cdk.config.ts)
  -- <cdk args>        Forward arguments to the underlying cdk CLI

Examples:
  npx simple-cdk@latest init
  simple-cdk list
  simple-cdk deploy                           # interactive stage picker
  simple-cdk deploy --stage prod -- --require-approval never
  simple-cdk diff --all                       # diff every stage
  simple-cdk diff --verbose                   # raw cdk output, no formatting
`);
}
