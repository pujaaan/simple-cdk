import type { Resource } from '@simple-cdk/core';
import type { aws_cognito } from 'aws-cdk-lib';

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
  construct?: aws_cognito.UserPool;
}

export type TriggerResource = Resource<TriggerResourceConfig> & { type: 'cognito-trigger' };

export interface CognitoAdapterOptions {
  /** User pool name suffix. Default: 'users'. */
  poolName?: string;
  /** Path to discover trigger handlers. Default: 'backend/triggers'. */
  triggersDir?: string;
  /** Stack to register the user pool under. Default: 'auth'. */
  stackName?: string;
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
  /** App client name. Default: 'web'. */
  clientName?: string;
}
