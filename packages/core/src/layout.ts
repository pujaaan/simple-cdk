/**
 * Convention helper. Returns directory paths for a nested `backend/` layout
 * grouped by concern (auth / tables / functions). Destructure into each
 * adapter's options when you want the cleaner layout without repeating
 * path literals:
 *
 * ```ts
 * const paths = standardLayout();
 * adapters: [
 *   cognitoAdapter({ triggersDir: paths.triggersDir }),
 *   dynamoDbAdapter({ dir: paths.tablesDir }),
 *   lambdaAdapter({ dir: paths.functionsDir }),
 * ]
 * ```
 *
 * Adapter defaults remain flat (`backend/triggers`, `backend/models`,
 * `backend/functions`) for backwards compatibility — this helper is
 * purely opt-in.
 */
export interface StandardLayoutPaths {
  /** Cognito triggers. Cognito adapter `triggersDir`. */
  triggersDir: string;
  /** DynamoDB model files. DynamoDB adapter `dir`. */
  tablesDir: string;
  /** Lambda handlers. Lambda adapter `dir`. */
  functionsDir: string;
  /** Conventional location for GraphQL schema + resolver source files. */
  apiDir: string;
}

export interface StandardLayoutOptions {
  /** Root directory. Default: 'backend'. */
  root?: string;
}

export function standardLayout(opts: StandardLayoutOptions = {}): StandardLayoutPaths {
  const root = opts.root ?? 'backend';
  return {
    triggersDir: `${root}/auth/triggers`,
    tablesDir: `${root}/tables`,
    functionsDir: `${root}/functions`,
    apiDir: `${root}/api`,
  };
}
