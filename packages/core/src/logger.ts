import type { Logger } from './types.js';

const LEVELS = ['debug', 'info', 'warn', 'error'] as const;
type Level = (typeof LEVELS)[number];

const COLORS: Record<Level, string> = {
  debug: '\x1b[90m',
  info: '\x1b[36m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
};
const RESET = '\x1b[0m';

function envLevel(): Level {
  const raw = (process.env.SIMPLE_CDK_LOG ?? 'info').toLowerCase();
  return (LEVELS as readonly string[]).includes(raw) ? (raw as Level) : 'info';
}

export function createLogger(scope: string): Logger {
  const min = LEVELS.indexOf(envLevel());

  function emit(level: Level, msg: string, meta?: Record<string, unknown>): void {
    if (LEVELS.indexOf(level) < min) return;
    const tag = `${COLORS[level]}${level.padEnd(5)}${RESET}`;
    const line = `${tag} [${scope}] ${msg}`;
    if (meta && Object.keys(meta).length > 0) {
      console.log(line, meta);
    } else {
      console.log(line);
    }
  }

  return {
    debug: (m, x) => emit('debug', m, x),
    info: (m, x) => emit('info', m, x),
    warn: (m, x) => emit('warn', m, x),
    error: (m, x) => emit('error', m, x),
  };
}
