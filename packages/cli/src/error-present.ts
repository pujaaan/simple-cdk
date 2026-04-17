import { isSimpleCdkError, type SimpleCdkError } from '@simple-cdk/core';
import { red, yellow, dim, bold } from './output.js';

/**
 * Sentinel thrown by cdk-passthrough when the `cdk` subprocess itself exits
 * non-zero. The child process has already printed its own error — we only
 * need to forward its exit code, not print another banner on top.
 */
export class CdkSubprocessError extends Error {
  readonly exitCode: number;
  constructor(verb: string, exitCode: number) {
    super(`cdk ${verb} exited with code ${exitCode}`);
    this.name = 'CdkSubprocessError';
    this.exitCode = exitCode;
  }
}

export function isCdkSubprocessError(e: unknown): e is CdkSubprocessError {
  return e instanceof CdkSubprocessError || (
    typeof e === 'object' &&
    e !== null &&
    (e as { name?: unknown }).name === 'CdkSubprocessError' &&
    typeof (e as { exitCode?: unknown }).exitCode === 'number'
  );
}

/**
 * Print an error and return the exit code the process should use.
 * - SimpleCdkError → friendly block, exit 1
 * - CdkSubprocessError → pass child exit code through (cdk already printed)
 * - anything else → internal-error banner + stack, exit 2
 */
export function presentError(err: unknown): number {
  if (isCdkSubprocessError(err)) {
    return err.exitCode || 1;
  }
  if (isSimpleCdkError(err)) {
    printFriendly(err);
    return 1;
  }
  printInternal(err);
  return 2;
}

function printFriendly(err: SimpleCdkError): void {
  const debug = isDebug();
  console.error();
  console.error(`${red('error:')} ${err.message}`);
  if (err.resource) {
    console.error(dim(`  looking for: ${err.resource}`));
  }
  if (err.available) {
    const list = err.available.length ? err.available.join(', ') : '(none)';
    console.error(dim(`  available:   ${list}`));
  }
  if (err.hint) {
    console.error(yellow(`  hint: ${err.hint}`));
  }
  console.error(dim(`  (code: ${err.code})`));
  if (debug) {
    console.error();
    console.error(dim('--- debug stack ---'));
    console.error(dim(err.stack ?? String(err)));
    if (err.cause) {
      console.error(dim('--- caused by ---'));
      console.error(dim(formatCause(err.cause)));
    }
  }
  console.error();
}

function printInternal(err: unknown): void {
  console.error();
  console.error(red(bold('internal error — this looks like a simple-cdk bug.')));
  console.error(dim('Please report at https://github.com/pujaaan/simple-cdk/issues'));
  console.error(dim('Include the stack trace below, your simple-cdk.config.ts, and the command you ran.'));
  console.error();
  if (err instanceof Error) {
    console.error(err.stack ?? `${err.name}: ${err.message}`);
    if ((err as { cause?: unknown }).cause) {
      console.error(dim('--- caused by ---'));
      console.error(formatCause((err as { cause?: unknown }).cause));
    }
  } else {
    console.error(String(err));
  }
  console.error();
}

function formatCause(cause: unknown): string {
  if (cause instanceof Error) return cause.stack ?? `${cause.name}: ${cause.message}`;
  return String(cause);
}

function isDebug(): boolean {
  const v = process.env.SIMPLE_CDK_DEBUG;
  return v === '1' || v === 'true';
}
