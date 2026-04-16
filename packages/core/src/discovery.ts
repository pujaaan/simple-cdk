import { readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

export interface ScanOptions {
  /** Directory to scan, relative to rootDir or absolute. */
  dir: string;
  /** File suffixes to match (e.g. ['.model.ts', '.model.js']). */
  match: string[];
  /** Names to skip (basename match). */
  ignore?: string[];
  /** Max recursion depth. Default: 8. */
  maxDepth?: number;
}

export interface ScannedFile {
  absolutePath: string;
  relativePath: string;
  basename: string;
  /** Filename minus the matched suffix, useful as a default resource name. */
  stem: string;
}

const DEFAULT_IGNORE = ['node_modules', '.git', 'dist', 'cdk.out', 'coverage'];

/**
 * Walk a directory and collect files whose name ends with one of `match`.
 * Returns an empty list (not an error) if the directory doesn't exist.
 */
export async function scanFiles(rootDir: string, opts: ScanOptions): Promise<ScannedFile[]> {
  const ignore = new Set([...DEFAULT_IGNORE, ...(opts.ignore ?? [])]);
  const maxDepth = opts.maxDepth ?? 8;
  const startDir = isAbsolute(opts.dir) ? opts.dir : join(rootDir, opts.dir);

  let exists = false;
  try {
    const s = await stat(startDir);
    exists = s.isDirectory();
  } catch {
    exists = false;
  }
  if (!exists) return [];

  const found: ScannedFile[] = [];

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (ignore.has(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      const suffix = opts.match.find((s) => entry.name.endsWith(s));
      if (!suffix) continue;
      found.push({
        absolutePath: full,
        relativePath: relative(rootDir, full),
        basename: entry.name,
        stem: entry.name.slice(0, entry.name.length - suffix.length),
      });
    }
  }

  await walk(startDir, 0);
  return found.sort((a, b) => a.absolutePath.localeCompare(b.absolutePath));
}

function isAbsolute(p: string): boolean {
  return p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p);
}
