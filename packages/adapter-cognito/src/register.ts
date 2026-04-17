import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { aws_cognito as cognito, aws_lambda_nodejs as lambdaNode, aws_lambda as lambda } from 'aws-cdk-lib';
import type { RegisterContext, WireContext } from '@simple-cdk/core';
import type { CognitoAdapterOptions, TriggerName, TriggerResource } from './types.js';

const TRIGGER_TO_ENUM: Record<TriggerName, cognito.UserPoolOperation> = {
  'pre-sign-up': cognito.UserPoolOperation.PRE_SIGN_UP,
  'post-confirmation': cognito.UserPoolOperation.POST_CONFIRMATION,
  'pre-authentication': cognito.UserPoolOperation.PRE_AUTHENTICATION,
  'post-authentication': cognito.UserPoolOperation.POST_AUTHENTICATION,
  'pre-token-generation': cognito.UserPoolOperation.PRE_TOKEN_GENERATION,
  'custom-message': cognito.UserPoolOperation.CUSTOM_MESSAGE,
  'define-auth-challenge': cognito.UserPoolOperation.DEFINE_AUTH_CHALLENGE,
  'create-auth-challenge': cognito.UserPoolOperation.CREATE_AUTH_CHALLENGE,
  'verify-auth-challenge': cognito.UserPoolOperation.VERIFY_AUTH_CHALLENGE_RESPONSE,
  'user-migration': cognito.UserPoolOperation.USER_MIGRATION,
};

export interface BuiltCognito {
  userPool: cognito.UserPool;
  client: cognito.UserPoolClient;
  triggers: Map<TriggerName, lambdaNode.NodejsFunction>;
}

const cache = new WeakMap<RegisterContext['app'], BuiltCognito>();

export function registerUserPool(ctx: RegisterContext, opts: CognitoAdapterOptions): BuiltCognito {
  const stack = opts.stack ?? ctx.stack(opts.stackName ?? 'auth', opts.stackId ? { id: opts.stackId } : undefined);
  const removal = removalPolicyFromStage(ctx.config.stageConfig.removalPolicy);

  const userPool = new cognito.UserPool(stack, opts.userPoolConstructId ?? 'UserPool', {
    userPoolName: opts.userPoolName ?? `${ctx.config.app}-${ctx.config.stage}-users`,
    selfSignUpEnabled: opts.selfSignUp ?? true,
    signInAliases: signInAliasFor(opts.signInAlias ?? 'email'),
    standardAttributes: opts.standardAttributes ?? { email: { required: true, mutable: true } },
    customAttributes: opts.customAttributes,
    passwordPolicy: opts.passwordPolicy ?? {
      minLength: 12,
      requireLowercase: true,
      requireUppercase: true,
      requireDigits: true,
      requireSymbols: false,
      tempPasswordValidity: Duration.days(7),
    },
    mfa: mfaFromOption(opts.mfa ?? 'off'),
    mfaSecondFactor: opts.mfaSecondFactor,
    userVerification: opts.userVerification,
    accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
    removalPolicy: removal,
  });

  const triggers = new Map<TriggerName, lambdaNode.NodejsFunction>();
  for (const resource of ctx.resources as TriggerResource[]) {
    const triggerId =
      opts.triggerConstructIds?.[resource.config.trigger] ?? `Trigger${pascal(resource.name)}`;
    const fn = new lambdaNode.NodejsFunction(stack, triggerId, {
      entry: resource.config.handlerFile,
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 256,
      timeout: Duration.seconds(15),
      environment: {
        STAGE: ctx.config.stage,
        APP: ctx.config.app,
        ...(ctx.config.stageConfig.env ?? {}),
      },
    });
    userPool.addTrigger(TRIGGER_TO_ENUM[resource.config.trigger], fn);
    triggers.set(resource.config.trigger, fn);
    resource.config.construct = fn;
  }

  const client = userPool.addClient(opts.clientConstructId ?? opts.clientName ?? 'web', {
    authFlows: opts.clientAuthFlows ?? { userSrp: true, userPassword: true },
    preventUserExistenceErrors: true,
    refreshTokenValidity: Duration.days(30),
    accessTokenValidity: Duration.hours(1),
    idTokenValidity: Duration.hours(1),
  });

  const built = { userPool, client, triggers };
  cache.set(ctx.app, built);
  return built;
}

export function getBuiltCognito(ctx: Pick<WireContext, 'app'>): BuiltCognito | undefined {
  return cache.get(ctx.app);
}

function signInAliasFor(alias: 'email' | 'username' | 'phone'): cognito.SignInAliases {
  switch (alias) {
    case 'email':
      return { email: true };
    case 'username':
      return { username: true };
    case 'phone':
      return { phone: true };
  }
}

function mfaFromOption(value: 'off' | 'optional' | 'required'): cognito.Mfa {
  switch (value) {
    case 'off':
      return cognito.Mfa.OFF;
    case 'optional':
      return cognito.Mfa.OPTIONAL;
    case 'required':
      return cognito.Mfa.REQUIRED;
  }
}

function removalPolicyFromStage(value: string | undefined): RemovalPolicy | undefined {
  switch (value) {
    case 'destroy':
      return RemovalPolicy.DESTROY;
    case 'retain':
      return RemovalPolicy.RETAIN;
    case 'snapshot':
      return RemovalPolicy.SNAPSHOT;
    default:
      return undefined;
  }
}

function pascal(s: string): string {
  return s
    .split(/[-_/\s]+/)
    .filter(Boolean)
    .map((p) => p[0]!.toUpperCase() + p.slice(1))
    .join('');
}
