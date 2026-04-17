import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createInterface, type Interface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';

interface InitChoices {
  appName: string;
  region: string;
  stage: string;
  adapters: {
    lambda: boolean;
    dynamodb: boolean;
    appsync: boolean;
    cognito: boolean;
    rds: boolean;
    outputs: boolean;
  };
  rdsEngine?: 'postgres' | 'mysql';
}

export async function initCommand(): Promise<void> {
  const cwd = process.cwd();
  const rl = createInterface({ input: stdin, output: stdout });

  console.log('simple-cdk init');
  console.log('Sets up a new project, or adds simple-cdk to an existing one.');
  console.log('');

  let choices: InitChoices;
  try {
    choices = await collectChoices(rl, cwd);
  } finally {
    rl.close();
  }

  const anyAdapter = Object.values(choices.adapters).some(Boolean);
  if (!anyAdapter) {
    console.error('No adapters selected. Pick at least one. Aborting.');
    process.exit(1);
  }

  console.log('');
  console.log('Setting up...');

  await ensurePackageJson(cwd, choices.appName);
  await runNpmInstall(cwd, choices);
  await writeConfigFile(cwd, choices);
  await scaffoldBackend(cwd, choices);

  console.log('');
  console.log('Done. Next steps:');
  console.log('  npx simple-cdk list                          # see what got discovered');
  console.log('  npx cdk bootstrap                            # one-time per region/account');
  console.log(`  npx simple-cdk deploy --stage ${choices.stage}                # push to AWS`);
  console.log('');
}

async function collectChoices(rl: Interface, cwd: string): Promise<InitChoices> {
  const folderName = basename(cwd);

  const appName = (await rl.question(`App name (${folderName}): `)).trim() || folderName;
  const region = (await rl.question('AWS region (us-east-1): ')).trim() || 'us-east-1';
  const stage = (await rl.question('Default stage name (dev): ')).trim() || 'dev';

  console.log('');
  console.log('Which adapters do you want?');

  const lambda = await confirm(rl, 'Add @simple-cdk/lambda?', true);
  const dynamodb = await confirm(rl, 'Add @simple-cdk/dynamodb?', true);
  const appsync = await confirm(rl, 'Add @simple-cdk/appsync?', true);
  const cognito = await confirm(rl, 'Add @simple-cdk/cognito?', false);
  const rds = await confirm(rl, 'Add @simple-cdk/rds (Postgres/MySQL)?', false);
  const outputs = await confirm(
    rl,
    'Add @simple-cdk/outputs (bundled SSM parameter for frontends)?',
    false,
  );

  let rdsEngine: 'postgres' | 'mysql' | undefined;
  if (rds) {
    const answer = (await rl.question('  RDS engine? (postgres/mysql, default postgres): '))
      .trim()
      .toLowerCase();
    rdsEngine = answer === 'mysql' ? 'mysql' : 'postgres';
  }

  return {
    appName,
    region,
    stage,
    adapters: { lambda, dynamodb, appsync, cognito, rds, outputs },
    rdsEngine,
  };
}

async function confirm(rl: Interface, question: string, defaultYes: boolean): Promise<boolean> {
  const suffix = defaultYes ? '(Y/n)' : '(y/N)';
  const answer = (await rl.question(`${question} ${suffix} `)).trim().toLowerCase();
  if (!answer) return defaultYes;
  return answer === 'y' || answer === 'yes';
}

async function ensurePackageJson(cwd: string, appName: string): Promise<void> {
  const pkgPath = join(cwd, 'package.json');
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
    if (pkg.type !== 'module') {
      pkg.type = 'module';
      await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
      console.log('  Set "type": "module" in package.json');
    }
    return;
  }
  const pkg = {
    name: appName,
    version: '0.0.0',
    private: true,
    type: 'module',
  };
  await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  console.log('  Created package.json');
}

async function getOwnVersion(): Promise<string> {
  const here = dirname(fileURLToPath(import.meta.url));
  const pkgPath = join(here, '..', '..', 'package.json');
  const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
  return pkg.version;
}

async function runNpmInstall(cwd: string, choices: InitChoices): Promise<void> {
  const version = await getOwnVersion();
  const pkgs: string[] = [
    `@simple-cdk/core@${version}`,
    `simple-cdk@${version}`,
    'aws-cdk-lib',
    'constructs',
    'aws-cdk',
  ];
  if (choices.adapters.lambda) pkgs.push(`@simple-cdk/lambda@${version}`);
  if (choices.adapters.dynamodb) pkgs.push(`@simple-cdk/dynamodb@${version}`);
  if (choices.adapters.appsync) pkgs.push(`@simple-cdk/appsync@${version}`);
  if (choices.adapters.cognito) pkgs.push(`@simple-cdk/cognito@${version}`);
  if (choices.adapters.rds) pkgs.push(`@simple-cdk/rds@${version}`);
  if (choices.adapters.outputs) pkgs.push(`@simple-cdk/outputs@${version}`);

  console.log(`  Installing: ${pkgs.join(' ')}`);
  await runCommand('npm', ['install', ...pkgs], cwd);
}

function runCommand(cmd: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: 'inherit' });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`));
    });
    child.on('error', reject);
  });
}

async function writeConfigFile(cwd: string, choices: InitChoices): Promise<void> {
  const configPath = join(cwd, 'simple-cdk.config.ts');
  if (existsSync(configPath)) {
    console.log('  Skipped simple-cdk.config.ts (already exists)');
    return;
  }

  const imports: string[] = [`import { defineConfig } from '@simple-cdk/core';`];
  const adapterLines: string[] = [];

  if (choices.adapters.lambda) {
    imports.push(`import { lambdaAdapter } from '@simple-cdk/lambda';`);
    adapterLines.push(`    lambdaAdapter(),`);
  }
  if (choices.adapters.dynamodb) {
    imports.push(`import { dynamoDbAdapter } from '@simple-cdk/dynamodb';`);
    adapterLines.push(`    dynamoDbAdapter(),`);
  }
  if (choices.adapters.appsync) {
    imports.push(`import { appSyncAdapter } from '@simple-cdk/appsync';`);
    const innerLines: string[] = [`      schemaFile: 'schema.graphql',`];
    if (choices.adapters.dynamodb) {
      innerLines.push(`      generateCrud: { models: 'all' },`);
    }
    if (choices.adapters.lambda) {
      innerLines.push(
        `      resolvers: [`,
        `        { typeName: 'Query', fieldName: 'hello', source: { kind: 'lambda', lambdaName: 'hello' } },`,
        `      ],`,
      );
    }
    adapterLines.push(`    appSyncAdapter({\n${innerLines.join('\n')}\n    }),`);
  }
  if (choices.adapters.cognito) {
    imports.push(`import { cognitoAdapter } from '@simple-cdk/cognito';`);
    adapterLines.push(`    cognitoAdapter(),`);
  }
  if (choices.adapters.rds) {
    imports.push(`import { rdsAdapter } from '@simple-cdk/rds';`);
    adapterLines.push(`    rdsAdapter({ engine: '${choices.rdsEngine ?? 'postgres'}' }),`);
  }
  if (choices.adapters.outputs) {
    imports.push(`import { outputsAdapter } from '@simple-cdk/outputs';`);
    adapterLines.push(
      `    outputsAdapter({`,
      `      // Return values here — they'll be bundled into one SSM parameter`,
      `      // at /<app>/<stage>/outputs and also emitted as CfnOutputs.`,
      `      collect: () => ({}),`,
      `    }),`,
    );
  }

  const content = `${imports.join('\n')}

export default defineConfig({
  app: '${choices.appName}',
  defaultStage: '${choices.stage}',
  stages: {
    ${choices.stage}: { region: '${choices.region}', removalPolicy: 'destroy' },
  },
  adapters: [
${adapterLines.join('\n')}
  ],
});
`;
  await writeFile(configPath, content, 'utf8');
  console.log('  Wrote simple-cdk.config.ts');
}

async function scaffoldBackend(cwd: string, choices: InitChoices): Promise<void> {
  if (choices.adapters.lambda) {
    const dir = join(cwd, 'backend', 'functions', 'hello');
    await mkdir(dir, { recursive: true });
    const handlerPath = join(dir, 'handler.ts');
    if (!existsSync(handlerPath)) {
      await writeFile(handlerPath, `export const handler = async () => 'hello world';\n`, 'utf8');
      console.log('  Created backend/functions/hello/handler.ts');
    }
  }
  if (choices.adapters.dynamodb) {
    const dir = join(cwd, 'backend', 'models');
    await mkdir(dir, { recursive: true });
    const modelPath = join(dir, 'todo.model.ts');
    if (!existsSync(modelPath)) {
      await writeFile(
        modelPath,
        `import type { DynamoDbModelConfig } from '@simple-cdk/dynamodb';

export default {
  pk: { name: 'id' },
} satisfies DynamoDbModelConfig;
`,
        'utf8',
      );
      console.log('  Created backend/models/todo.model.ts');
    }
  }
  if (choices.adapters.appsync) {
    const schemaPath = join(cwd, 'schema.graphql');
    if (!existsSync(schemaPath)) {
      await writeFile(schemaPath, generateSchema(choices), 'utf8');
      console.log('  Created schema.graphql');
    }
  }
  if (choices.adapters.cognito) {
    const dir = join(cwd, 'backend', 'triggers');
    await mkdir(dir, { recursive: true });
    const gitkeepPath = join(dir, '.gitkeep');
    if (!existsSync(gitkeepPath)) {
      await writeFile(gitkeepPath, '', 'utf8');
      console.log('  Created backend/triggers/');
    }
  }
}

function generateSchema(choices: InitChoices): string {
  const types: string[] = [];
  const queryFields: string[] = [];
  const mutationFields: string[] = [];

  if (choices.adapters.lambda) {
    queryFields.push('  hello: String');
  }
  if (choices.adapters.dynamodb) {
    types.push('type Todo {\n  id: ID!\n}');
    types.push('type TodoConnection {\n  items: [Todo!]!\n  nextToken: String\n}');
    types.push('input CreateTodoInput { id: ID! }');
    types.push('input UpdateTodoInput { id: ID! }');
    queryFields.push('  getTodo(id: ID!): Todo');
    queryFields.push('  listTodos(limit: Int, nextToken: String): TodoConnection');
    mutationFields.push('  createTodo(input: CreateTodoInput!): Todo');
    mutationFields.push('  updateTodo(input: UpdateTodoInput!): Todo');
    mutationFields.push('  deleteTodo(id: ID!): Todo');
  }
  if (queryFields.length === 0) {
    queryFields.push('  ping: String');
  }

  const parts: string[] = [];
  if (types.length) parts.push(types.join('\n\n'));
  parts.push(`type Query {\n${queryFields.join('\n')}\n}`);
  if (mutationFields.length) parts.push(`type Mutation {\n${mutationFields.join('\n')}\n}`);

  return parts.join('\n\n') + '\n';
}
