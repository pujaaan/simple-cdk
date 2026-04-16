/**
 * Default auth pipeline function: a no-op pass-through. Real apps will
 * replace this with their own (the whole point of the pluggable pipeline).
 *
 * Returns the source code as a string because AppSync expects an inline
 * function or a file — not an imported module.
 */
export const PASSTHROUGH_AUTH_CODE = `
export function request(ctx) {
  return {};
}

export function response(ctx) {
  return ctx.prev.result;
}
`.trim();
