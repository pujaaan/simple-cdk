# @simple-cdk/core

The engine for [simple-cdk](https://github.com/pujaaan/simple-cdk). Adapter loader, lifecycle, config, and the public types that every adapter implements.

## Install

```bash
npm install @simple-cdk/core aws-cdk-lib constructs
```

## What it exports

```ts
import { defineConfig, Engine, scanFiles } from '@simple-cdk/core';
import type { Adapter, AppConfig, Resource, RegisterContext, WireContext } from '@simple-cdk/core';
```

- `defineConfig(config)`: type-safe identity helper for your `simple-cdk.config.ts`
- `Engine`: runs the discover → register → wire lifecycle and returns a CDK App
- `scanFiles(rootDir, opts)`: filesystem helper for adapters that scan for files
- `Adapter`, `Resource`, `*Context`: the contract every adapter implements

## Status

Pre-1.0. APIs may change. Full docs at the [main repo](https://github.com/pujaaan/simple-cdk).
