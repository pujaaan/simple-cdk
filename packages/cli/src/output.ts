import type { Readable } from 'node:stream';

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code: string, s: string) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
export const green = (s: string) => c('32', s);
export const yellow = (s: string) => c('33', s);
export const red = (s: string) => c('31', s);
export const dim = (s: string) => c('2', s);
export const bold = (s: string) => c('1', s);
export const cyan = (s: string) => c('36', s);

// [+] AWS::Lambda::Function MyStack/Lambda/Resource LambdaABCD1234  (trailing qualifier optional)
const DIFF_RE = /^\s*\[([+~\-])\]\s+(AWS::\S+)\s+(\S+)(?:\s+\S+)?\s*$/;
// Stack | progress | time | STATUS | TYPE | Name...
const DEPLOY_RE =
  /^(\S+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([A-Z_]+)\s*\|\s*(AWS::[^|]+?)\s*\|\s*(.+?)\s*$/;

interface DiffRow {
  status: '+' | '~' | '-';
  type: string;
  name: string;
}

export async function renderDiff(stdout: Readable, stderr: Readable): Promise<void> {
  const rows: DiffRow[] = [];

  const onLine = (line: string, source: StreamSource) => {
    const m = DIFF_RE.exec(line);
    if (m) {
      rows.push({ status: m[1] as DiffRow['status'], type: m[2]!, name: m[3]! });
      return;
    }
    // Suppress nested-diff detail lines (tree glyphs + @@ hunks).
    if (/^\s*[├└│]/.test(line) || line.includes('@@')) return;
    emitClassified(line, source);
  };

  await Promise.all([
    forEachLine(stdout, 'stdout', onLine),
    forEachLine(stderr, 'stderr', onLine),
  ]);
  printDiffTable(rows);
}

function printDiffTable(rows: DiffRow[]): void {
  if (rows.length === 0) {
    console.log();
    console.log(dim('  No resource changes.'));
    console.log();
    return;
  }

  const typeW = Math.max('Resource Type'.length, ...rows.map((r) => r.type.length));
  const nameW = Math.max('Name'.length, ...rows.map((r) => r.name.length));

  const divider = dim('  ' + '─'.repeat(3 + typeW + nameW + 4));
  console.log();
  console.log(`  ${bold(pad('', 1))}  ${bold(pad('Resource Type', typeW))}  ${bold('Name')}`);
  console.log(divider);
  for (const row of rows) {
    const marker =
      row.status === '+' ? green('+') : row.status === '-' ? red('-') : yellow('~');
    console.log(`  ${marker}  ${pad(row.type, typeW)}  ${row.name}`);
  }

  const adds = rows.filter((r) => r.status === '+').length;
  const mods = rows.filter((r) => r.status === '~').length;
  const dels = rows.filter((r) => r.status === '-').length;
  console.log();
  console.log(
    `  ${green(`+${adds} to add`)}   ${yellow(`~${mods} to modify`)}   ${red(`-${dels} to destroy`)}`,
  );
  console.log();
}

export async function renderDeploy(stdout: Readable, stderr: Readable): Promise<void> {
  let headerPrinted = false;

  const onLine = (line: string, source: StreamSource) => {
    const m = DEPLOY_RE.exec(line);
    if (m) {
      if (!headerPrinted) {
        printDeployHeader();
        headerPrinted = true;
      }
      printDeployRow({ stack: m[1]!, status: m[4]!, type: m[5]!, name: m[6]! });
      return;
    }
    // Pass through CDK's final status / outputs verbatim.
    if (/^\s*[✅❌⚠]|^Outputs:|^ ✨|^[A-Za-z0-9_-]+\.\S+ = /.test(line)) {
      console.log(line);
      return;
    }
    emitClassified(line, source);
  };

  await Promise.all([
    forEachLine(stdout, 'stdout', onLine),
    forEachLine(stderr, 'stderr', onLine),
  ]);
}

function printDeployHeader(): void {
  console.log();
  console.log(
    `  ${bold(pad('Status', 22))}  ${bold(pad('Resource Type', 36))}  ${bold('Name')}`,
  );
  console.log(dim('  ' + '─'.repeat(22 + 36 + 20)));
}

function printDeployRow(e: { stack: string; status: string; type: string; name: string }): void {
  const colored = colorStatus(e.status);
  console.log(`  ${padRaw(colored, e.status, 22)}  ${pad(e.type, 36)}  ${e.name}`);
}

function colorStatus(status: string): string {
  if (status.includes('FAILED') || status.includes('ROLLBACK')) return red(status);
  if (status.includes('COMPLETE')) return green(status);
  if (status.includes('IN_PROGRESS')) return yellow(status);
  return status;
}

type Classification = 'hide' | 'warn' | 'error' | 'success';

// Classify a line by CONTENT, not by source stream. Unclassified lines
// fall through to dim — cdk + esbuild + npm all emit progress on stderr
// that isn't an error, so stream-based red would cry wolf on routine
// chatter. Real failures surface via the command's non-zero exit code,
// not stderr color. Ordering matters — noise + warning patterns run
// before the error checks so advisories can't get misread as errors.
function classify(line: string): Classification | null {
  if (!line.trim()) return 'hide';

  // Noise — hide entirely.
  if (/^Bundling asset/.test(line)) return 'hide';
  if (/^\s*\.\.\..*-building\//.test(line)) return 'hide';
  if (/^\s*\.\.\..*dling-temp/.test(line)) return 'hide';
  if (/^⚡ Done/.test(line)) return 'hide';
  if (/^(added|removed|changed|up to date)\b.*\bpackage/.test(line)) return 'hide';
  if (/^audited \d+ package/.test(line)) return 'hide';
  if (/^found \d+ vulnerabilit/.test(line)) return 'hide';
  if (/^\d+ package(s)? (are|is) looking for funding/.test(line)) return 'hide';
  if (/^\s*run `npm fund`/.test(line)) return 'hide';
  // cdk per-stack build progress — hide the start line (noise), color the
  // success line green so the user still sees a positive milestone per stack.
  if (/^\S+:\s+start:\s+Building\b/.test(line)) return 'hide';
  if (/^\S+:\s+success:\s+Built\b/.test(line)) return 'success';

  // Known unactionable CDK-internal deprecations — aws-cdk-lib itself still
  // passes the deprecated `scope` field into its own `addPermission` calls
  // when wiring Cognito triggers. Nothing the consumer can fix; hide the
  // [WARNING] line and its two standard continuations so we don't alarm on
  // chatter the user can't act on.
  if (/\[WARNING\].*GrantOnPrincipalOptions#scope/.test(line)) return 'hide';
  if (/^\s*The scope argument is currently unused\.?$/.test(line)) return 'hide';
  if (/^\s*This API will be removed in the next major release\.?$/.test(line)) return 'hide';

  // Warnings — deprecations + advisory chatter, everything yellow.
  if (/\[WARNING\]/.test(line)) return 'warn';
  if (/^\s*\[Info at\s/.test(line)) return 'warn';
  if (/deprecated\./i.test(line)) return 'warn';
  if (/^npm (warn|notice)\b/i.test(line)) return 'warn';

  // Errors — explicit markers only. Keep this list tight; unclassified
  // lines fall through to dim so new cdk chatter doesn't render red.
  if (/^❌/.test(line)) return 'error';
  if (/^\s*Error:/i.test(line)) return 'error';
  if (/^npm (err|error)\b/i.test(line)) return 'error';
  if (/^Since this app includes/.test(line)) return 'error';
  if (/^Deployment failed/i.test(line)) return 'error';
  if (/\bfailed:\s/i.test(line)) return 'error';

  return null;
}

function emitClassified(line: string, _source: StreamSource): void {
  const c = classify(line);
  if (c === 'hide') return;
  if (c === 'success') {
    console.log(green(line));
    return;
  }
  if (c === 'warn') {
    process.stderr.write(yellow(line) + '\n');
    return;
  }
  if (c === 'error') {
    process.stderr.write(red(line) + '\n');
    return;
  }
  // Unclassified — always dim, regardless of source stream.
  console.log(dim(line));
}

function pad(s: string, width: number): string {
  return s.length >= width ? s : s + ' '.repeat(width - s.length);
}

// Pad a colored string based on its visible (uncolored) length.
function padRaw(colored: string, raw: string, width: number): string {
  return raw.length >= width ? colored : colored + ' '.repeat(width - raw.length);
}

type StreamSource = 'stdout' | 'stderr';

function forEachLine(
  stream: Readable,
  source: StreamSource,
  onLine: (line: string, source: StreamSource) => void,
): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    let buf = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk: string) => {
      buf += chunk;
      let idx: number;
      while ((idx = buf.indexOf('\n')) >= 0) {
        onLine(buf.slice(0, idx).replace(/\r$/, ''), source);
        buf = buf.slice(idx + 1);
      }
      // If the trailing buffer looks like an interactive prompt
      // (e.g. "Do you wish to deploy these changes (y/n)?"), flush it raw
      // so the user can actually see and respond to it.
      if (buf.length > 0 && /[?:]\s*$/.test(buf)) {
        process.stdout.write(buf);
        buf = '';
      }
    });
    stream.on('end', () => {
      if (buf.trim()) onLine(buf, source);
      resolvePromise();
    });
    stream.on('error', reject);
  });
}
