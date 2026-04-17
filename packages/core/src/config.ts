import { resolve } from 'node:path';
import { SimpleCdkError } from './error.js';
import type { AppConfig, ResolvedAppConfig, StageConfig } from './types.js';

const APP_NAME_RE = /^[A-Za-z][A-Za-z0-9_-]*$/;
const STAGE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const REGION_RE = /^[a-z]{2}-[a-z]+-\d+$/;
const ACCOUNT_RE = /^\d{12}$/;
const REMOVAL_POLICIES: ReadonlySet<NonNullable<StageConfig['removalPolicy']>> = new Set([
  'destroy',
  'retain',
  'snapshot',
]);
const ALLOWED_LOG_RETENTION: ReadonlySet<number> = new Set([
  1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1096, 1827, 2192, 2557, 2922,
  3288, 3653,
]);

interface ValidationIssue {
  path: string;
  message: string;
  hint?: string;
}

/**
 * Identity helper that gives consumers full type inference and validates the
 * config shape at load time. Throws a `SimpleCdkError{ code: 'CONFIG_INVALID' }`
 * with a collected list of issues so the user can fix everything in one pass,
 * rather than discovering problems one at a time at deploy time.
 */
export function defineConfig(config: AppConfig): AppConfig {
  const issues = validateConfig(config);
  if (issues.length > 0) {
    throw toConfigError(issues);
  }
  return config;
}

export interface ResolveOptions {
  stage?: string;
  rootDir?: string;
}

export function resolveConfig(config: AppConfig, opts: ResolveOptions = {}): ResolvedAppConfig {
  // `defineConfig` already validates; re-validate here to cover callers that
  // build configs by hand and skip `defineConfig`. Idempotent + cheap.
  const issues = validateConfig(config);
  if (issues.length > 0) throw toConfigError(issues);

  const stage = opts.stage ?? config.defaultStage ?? Object.keys(config.stages)[0]!;
  const stageConfig = config.stages[stage];
  if (!stageConfig) {
    const known = Object.keys(config.stages).join(', ');
    throw new SimpleCdkError({
      code: 'USER_INPUT',
      message: `Unknown stage "${stage}".`,
      resource: `stage "${stage}"`,
      available: Object.keys(config.stages),
      hint: `pass --stage with one of: ${known}`,
    });
  }

  const rootDir = resolve(opts.rootDir ?? config.rootDir ?? process.cwd());
  return { ...config, rootDir, stage, stageConfig };
}

function validateConfig(config: AppConfig): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // --- app ---
  if (!config || typeof config !== 'object') {
    return [
      {
        path: 'config',
        message: 'config must be an object returned from defineConfig(...).',
        hint: 'see README for the expected shape.',
      },
    ];
  }
  if (!config.app || typeof config.app !== 'string') {
    issues.push({
      path: 'config.app',
      message: 'app is required and must be a string.',
      hint: 'pick a short, URL-safe name — it prefixes every resource.',
    });
  } else if (!APP_NAME_RE.test(config.app)) {
    issues.push({
      path: 'config.app',
      message: `app "${config.app}" must match ${APP_NAME_RE} (letter first, then letters/digits/hyphens/underscores).`,
      hint: 'avoid whitespace, dots, and slashes — app name appears in stack ids and resource names.',
    });
  }

  // --- stages ---
  if (!config.stages || typeof config.stages !== 'object') {
    issues.push({
      path: 'config.stages',
      message: 'stages is required and must be an object.',
      hint: 'define at least one stage, e.g. { dev: { region: "us-east-1" } }.',
    });
  } else {
    const stageNames = Object.keys(config.stages);
    if (stageNames.length === 0) {
      issues.push({
        path: 'config.stages',
        message: 'stages must define at least one stage.',
      });
    }
    for (const name of stageNames) {
      validateStage(name, config.stages[name], issues);
    }
    if (
      config.defaultStage !== undefined &&
      !Object.prototype.hasOwnProperty.call(config.stages, config.defaultStage)
    ) {
      issues.push({
        path: 'config.defaultStage',
        message: `defaultStage "${config.defaultStage}" is not one of your stages.`,
        hint: `known stages: ${stageNames.join(', ') || '(none)'}`,
      });
    }
  }

  // --- adapters ---
  if (!Array.isArray(config.adapters)) {
    issues.push({
      path: 'config.adapters',
      message: 'adapters must be an array.',
      hint: 'import adapters from @simple-cdk/* packages and list them here.',
    });
  } else if (config.adapters.length === 0) {
    issues.push({
      path: 'config.adapters',
      message: 'adapters must include at least one adapter.',
      hint: 'add e.g. lambdaAdapter() to config.adapters.',
    });
  } else {
    const seen = new Set<string>();
    for (let i = 0; i < config.adapters.length; i++) {
      const adapter = config.adapters[i];
      const path = `config.adapters[${i}]`;
      if (!adapter || typeof adapter !== 'object') {
        issues.push({
          path,
          message: 'adapter entry must be an object returned from an adapter factory.',
          hint: 'call adapter factories, e.g. lambdaAdapter() — not lambdaAdapter.',
        });
        continue;
      }
      if (!adapter.name || typeof adapter.name !== 'string') {
        issues.push({
          path: `${path}.name`,
          message: 'adapter is missing a name.',
          hint: 'every adapter must declare a unique "name" string.',
        });
        continue;
      }
      if (seen.has(adapter.name)) {
        issues.push({
          path,
          message: `duplicate adapter name "${adapter.name}".`,
          hint: 'adapter names must be unique — if overriding, remove the original from the array.',
        });
      }
      seen.add(adapter.name);

      const hasHook =
        typeof adapter.discover === 'function' ||
        typeof adapter.register === 'function' ||
        typeof adapter.wire === 'function' ||
        typeof adapter.commands === 'function';
      if (!hasHook) {
        issues.push({
          path,
          message: `adapter "${adapter.name}" declares no lifecycle hooks — it will do nothing.`,
          hint: 'check imports — you may be passing the factory (lambdaAdapter) instead of calling it (lambdaAdapter()).',
        });
      }
    }
  }

  return issues;
}

function validateStage(name: string, stage: StageConfig | undefined, issues: ValidationIssue[]): void {
  const path = `config.stages["${name}"]`;
  if (!STAGE_NAME_RE.test(name)) {
    issues.push({
      path: `config.stages`,
      message: `stage name "${name}" is invalid.`,
      hint: 'stage names must start with a letter or digit, then letters/digits/hyphens/underscores (e.g. "dev", "prod", "pr-123").',
    });
  }
  if (!stage || typeof stage !== 'object') {
    issues.push({
      path,
      message: `stage "${name}" must be an object.`,
    });
    return;
  }
  if (!stage.region || typeof stage.region !== 'string') {
    issues.push({
      path: `${path}.region`,
      message: `stage "${name}" is missing required "region".`,
      hint: 'e.g. region: "us-east-1".',
    });
  } else if (!REGION_RE.test(stage.region)) {
    issues.push({
      path: `${path}.region`,
      message: `region "${stage.region}" doesn't look like an AWS region.`,
      hint: 'expected format: "us-east-1", "eu-west-2", etc.',
    });
  }
  if (stage.account !== undefined && !ACCOUNT_RE.test(stage.account)) {
    issues.push({
      path: `${path}.account`,
      message: `account "${stage.account}" must be a 12-digit AWS account id.`,
    });
  }
  if (stage.removalPolicy !== undefined && !REMOVAL_POLICIES.has(stage.removalPolicy)) {
    issues.push({
      path: `${path}.removalPolicy`,
      message: `removalPolicy "${stage.removalPolicy}" is not valid.`,
      hint: `expected one of: destroy, retain, snapshot.`,
    });
  }
  if (stage.logRetentionDays !== undefined) {
    if (!Number.isInteger(stage.logRetentionDays) || stage.logRetentionDays <= 0) {
      issues.push({
        path: `${path}.logRetentionDays`,
        message: `logRetentionDays must be a positive integer.`,
      });
    } else if (!ALLOWED_LOG_RETENTION.has(stage.logRetentionDays)) {
      issues.push({
        path: `${path}.logRetentionDays`,
        message: `logRetentionDays ${stage.logRetentionDays} is not one of CloudWatch's allowed values.`,
        hint: 'allowed: 1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1096, 1827, 2192, 2557, 2922, 3288, 3653.',
      });
    }
  }
  if (stage.tags !== undefined && (typeof stage.tags !== 'object' || stage.tags === null || Array.isArray(stage.tags))) {
    issues.push({
      path: `${path}.tags`,
      message: 'tags must be a plain object of string-to-string.',
    });
  }
  if (stage.env !== undefined && (typeof stage.env !== 'object' || stage.env === null || Array.isArray(stage.env))) {
    issues.push({
      path: `${path}.env`,
      message: 'env must be a plain object of string-to-string.',
    });
  }
}

function toConfigError(issues: ValidationIssue[]): SimpleCdkError {
  const header = issues.length === 1
    ? `config is invalid (1 issue).`
    : `config is invalid (${issues.length} issues).`;
  const body = issues
    .map((i) => {
      const hint = i.hint ? `\n      hint: ${i.hint}` : '';
      return `  - ${i.path}: ${i.message}${hint}`;
    })
    .join('\n');
  return new SimpleCdkError({
    code: 'CONFIG_INVALID',
    message: `${header}\n${body}`,
    hint: 'fix the issues above in simple-cdk.config.ts and re-run.',
  });
}
