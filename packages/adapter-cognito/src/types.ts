import type { Resource } from '@simple-cdk/core';
import type { aws_cognito, aws_lambda_nodejs, Stack } from 'aws-cdk-lib';

/**
 * Cognito Lambda trigger names supported by simple-cdk's auto-discovery.
 * Trigger folder names map to these via kebab-case (e.g. `pre-token-generation`).
 */
export type TriggerName =
  | 'pre-sign-up'
  | 'post-confirmation'
  | 'pre-authentication'
  | 'post-authentication'
  | 'pre-token-generation'
  | 'custom-message'
  | 'define-auth-challenge'
  | 'create-auth-challenge'
  | 'verify-auth-challenge'
  | 'user-migration';

export interface TriggerResourceConfig {
  trigger: TriggerName;
  handlerFile: string;
  construct?: aws_lambda_nodejs.NodejsFunction;
}

export type TriggerResource = Resource<TriggerResourceConfig> & { type: 'cognito-trigger' };

export interface CognitoAdapterOptions {
  /**
   * Pin the CloudFormation logical ID for the UserPool. Use when adopting
   * simple-cdk over an existing stack whose pool was created under a
   * different logical ID. Default: `'UserPool'`.
   */
  userPoolConstructId?: string;
  /**
   * User pool name (the AWS resource name, not the CF logical ID).
   * Default: `${app}-${stage}-users`. Set verbatim when adopting an
   * existing deployed pool — CloudFormation treats name changes as
   * replace (user loss).
   */
  userPoolName?: string;
  /** Path to discover trigger handlers. Default: 'backend/triggers'. */
  triggersDir?: string;
  /** Stack to register the user pool under. Default: 'auth'. */
  stackName?: string;
  /**
   * Pin the CloudFormation logical ID of the stack verbatim, skipping
   * the `<app>-<stage>-` prefix. Use when adopting an existing stack.
   */
  stackId?: string;
  /**
   * Register the pool under a consumer-created Stack instead of letting
   * the engine create one. Takes precedence over `stackName` / `stackId`.
   */
  stack?: Stack;
  /** Sign-in attribute. Default: 'email'. */
  signInAlias?: 'email' | 'username' | 'phone';
  /** Self sign-up enabled. Default: true. */
  selfSignUp?: boolean;
  /** Standard attributes. Default: just `email` (required). */
  standardAttributes?: aws_cognito.StandardAttributes;
  /** Custom attributes. */
  customAttributes?: Record<string, aws_cognito.ICustomAttribute>;
  /** Password policy overrides. */
  passwordPolicy?: aws_cognito.PasswordPolicy;
  /** MFA settings. Default: OFF. */
  mfa?: 'off' | 'optional' | 'required';
  /**
   * Which second factors are enabled when `mfa` is 'optional' or 'required'.
   * Pass `{ sms: true, otp: true }` for SMS + TOTP. Default: `{ sms: true }`
   * (matches the CDK default when MFA is turned on).
   */
  mfaSecondFactor?: aws_cognito.MfaSecondFactor;
  /**
   * Email/SMS verification message overrides. Use when customizing the
   * subject and body of the verification email/SMS the pool sends on
   * self-signup.
   */
  userVerification?: aws_cognito.UserVerificationConfig;
  /** App client name. Default: 'web'. */
  clientName?: string;
  /**
   * Auth flows enabled on the app client. Default:
   * `{ userSrp: true, userPassword: true }`. Pass `{ custom: true }` to
   * enable the custom auth flow used by define/create/verify-auth-challenge
   * triggers (e.g. OTP).
   */
  clientAuthFlows?: aws_cognito.AuthFlow;
  /**
   * Pin the CloudFormation logical ID for the app client. Use when adopting
   * simple-cdk over an existing pool whose client was created under a
   * different logical ID. Default: derived from `clientName`.
   */
  clientConstructId?: string;
  /**
   * Pin the CloudFormation logical IDs for discovered trigger Lambda
   * functions. Keys are trigger names (`pre-sign-up`, etc.); values are
   * the verbatim logical IDs. Omitted triggers fall back to the default
   * `Trigger${PascalCase(name)}`.
   */
  triggerConstructIds?: Partial<Record<TriggerName, string>>;
}
