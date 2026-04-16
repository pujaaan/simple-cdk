/**
 * Bare-bones argv parser. Sufficient for our flags; intentionally avoids
 * pulling in a heavyweight dependency.
 *
 * Recognizes: `--key value`, `--key=value`, and bare positionals.
 */
export interface ParsedArgs {
  positional: string[];
  flags: Record<string, string | true>;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | true> = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const stripped = arg.slice(2);
    const eq = stripped.indexOf('=');
    if (eq >= 0) {
      flags[stripped.slice(0, eq)] = stripped.slice(eq + 1);
      continue;
    }
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      flags[stripped] = next;
      i++;
    } else {
      flags[stripped] = true;
    }
  }

  return { positional, flags };
}

export function flagAsString(flags: ParsedArgs['flags'], name: string, fallback?: string): string | undefined {
  const v = flags[name];
  if (v === true) return fallback;
  return v ?? fallback;
}
