# @simple-cdk/cognito

[simple-cdk](https://github.com/pujaaan/simple-cdk) adapter that creates a Cognito user pool, an app client, and auto-discovers Lambda triggers from the filesystem.

## Install

```bash
npm install @simple-cdk/cognito @simple-cdk/core aws-cdk-lib constructs
```

## Convention

Each Cognito trigger is a folder under `backend/triggers/<trigger-name>/`:

```
backend/triggers/
├── pre-token-generation/
│   └── handler.ts
├── post-confirmation/
│   └── handler.ts
└── pre-sign-up/
    └── handler.ts
```

Folder names must match a known Cognito trigger:

`pre-sign-up`, `post-confirmation`, `pre-authentication`, `post-authentication`,
`pre-token-generation`, `custom-message`, `define-auth-challenge`,
`create-auth-challenge`, `verify-auth-challenge`, `user-migration`.

## Usage

```ts
import { defineConfig } from '@simple-cdk/core';
import { cognitoAdapter } from '@simple-cdk/cognito';

export default defineConfig({
  app: 'my-app',
  stages: { dev: { region: 'us-east-1' } },
  adapters: [
    cognitoAdapter({
      // userPoolName: 'my-pool',         // default: '<app>-<stage>-users'
      triggersDir: 'backend/triggers',    // default
      stackName: 'auth',
      signInAlias: 'email',
      selfSignUp: true,
      mfa: 'off',                         // 'off' | 'optional' | 'required'
      // mfaSecondFactor: { sms: true, otp: true }, // second factors when MFA on
      // userVerification: { emailSubject: '...', emailBody: '...' },
      // clientAuthFlows: { custom: true }, // for define/create/verify-auth-challenge OTP flow
      passwordPolicy: { minLength: 12, requireSymbols: true },
    }),
  ],
});
```

## Cross-adapter lookup

```ts
import { getUserPool, getUserPoolClient } from '@simple-cdk/cognito';

// inside another adapter's wire():
const pool = getUserPool(ctx);
const client = getUserPoolClient(ctx);
```

Full docs at the [main repo](https://github.com/pujaaan/simple-cdk).
