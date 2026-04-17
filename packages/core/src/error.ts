/**
 * Error class for user-attributable failures in simple-cdk. Anything thrown as
 * a `SimpleCdkError` is understood by the CLI to be a problem with user config,
 * user code, or ordering — not a framework bug — and is rendered as a clean,
 * actionable block without a stack trace.
 *
 * Raw `Error` thrown from the engine or adapters is treated as a bug and
 * rendered with a full stack + "please report" banner.
 */

export type SimpleCdkErrorCode =
  | 'CONFIG_INVALID'
  | 'CONFIG_NOT_FOUND'
  | 'RESOURCE_NOT_FOUND'
  | 'ADAPTER_NOT_RUN'
  | 'ADAPTER_ORDER'
  | 'DISCOVERY_FAILED'
  | 'WIRE_REFERENCE'
  | 'USER_INPUT';

export interface SimpleCdkErrorInit {
  code: SimpleCdkErrorCode;
  message: string;
  resource?: string;
  available?: readonly string[];
  hint?: string;
  cause?: unknown;
}

export class SimpleCdkError extends Error {
  readonly code: SimpleCdkErrorCode;
  readonly resource?: string;
  readonly available?: readonly string[];
  readonly hint?: string;
  override readonly cause?: unknown;

  constructor(init: SimpleCdkErrorInit) {
    super(init.message);
    this.name = 'SimpleCdkError';
    this.code = init.code;
    this.resource = init.resource;
    this.available = init.available;
    this.hint = init.hint;
    this.cause = init.cause;
  }
}

export function isSimpleCdkError(e: unknown): e is SimpleCdkError {
  if (e instanceof SimpleCdkError) return true;
  // Fallback for the edge case of duplicate core copies on the module graph
  // (e.g. a user hoists @simple-cdk/core twice via npm link).
  if (
    typeof e === 'object' &&
    e !== null &&
    (e as { name?: unknown }).name === 'SimpleCdkError' &&
    typeof (e as { code?: unknown }).code === 'string'
  ) {
    return true;
  }
  return false;
}

export interface ResourceNotFoundArgs {
  /** Human label for the kind of thing being looked up, e.g. 'Lambda', 'DynamoDB table'. */
  kind: string;
  /** The name the caller asked for; omit for singletons. */
  name?: string;
  /** Names currently known in the relevant bucket. */
  available: readonly string[];
  /** Adapter the helper lives in — used to suggest config fixes. */
  adapterName: string;
  /** Optional override hint — defaults to a kind-specific suggestion. */
  hint?: string;
}

export function resourceNotFound(args: ResourceNotFoundArgs): SimpleCdkError {
  const { kind, name, available, adapterName, hint } = args;
  const subject = name ? `${kind} "${name}"` : kind;
  const defaultHint =
    available.length === 0
      ? `no ${kind.toLowerCase()}s were discovered by the ${adapterName} adapter — ` +
        `check the discovery folder layout or the adapter's options.`
      : `check the name matches one of the discovered ${kind.toLowerCase()}s above.`;

  return new SimpleCdkError({
    code: 'RESOURCE_NOT_FOUND',
    message: `${subject} was not found.`,
    resource: subject,
    available,
    hint: hint ?? defaultHint,
  });
}

/**
 * Throws a `RESOURCE_NOT_FOUND` error when `value` is undefined/null, otherwise
 * returns it. Use in `getX(ctx, name)` helpers to produce uniform errors.
 */
export function requireResource<T>(
  value: T | undefined | null,
  args: ResourceNotFoundArgs,
): T {
  if (value === undefined || value === null) {
    throw resourceNotFound(args);
  }
  return value;
}

export interface AdapterNotRunArgs {
  /** Package adapter name, e.g. 'rds', 'cognito', 'appsync'. */
  adapterName: string;
  /** Human label for the kind of resource being requested. */
  kind: string;
  /** Function call the user would add to their adapters array. */
  adapterCall?: string;
}

export function adapterNotRun(args: AdapterNotRunArgs): SimpleCdkError {
  const { adapterName, kind, adapterCall } = args;
  const call = adapterCall ?? `${adapterName}Adapter()`;
  return new SimpleCdkError({
    code: 'ADAPTER_NOT_RUN',
    message: `${kind} was requested but the ${adapterName} adapter is not in your config.`,
    hint: `add ${call} to the adapters array in simple-cdk.config.ts.`,
  });
}

export interface AdapterOrderArgs {
  adapterName: string;
  kind: string;
  /** The caller's adapter name — so the hint can say "list X before Y". */
  callerAdapterName?: string;
}

export function adapterOrderError(args: AdapterOrderArgs): SimpleCdkError {
  const { adapterName, kind, callerAdapterName } = args;
  const hint = callerAdapterName
    ? `list ${adapterName}Adapter() before ${callerAdapterName}Adapter() in the adapters array, ` +
      `so registration runs before wiring.`
    : `${adapterName}Adapter() must be listed earlier in the adapters array than the code calling this lookup.`;
  return new SimpleCdkError({
    code: 'ADAPTER_ORDER',
    message: `${kind} was requested before the ${adapterName} adapter ran.`,
    hint,
  });
}
