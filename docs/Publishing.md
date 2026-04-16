# Publishing

How to push simple-cdk to GitHub and npm. Pre-1.0 — every release can break things.

## One-time setup

### GitHub

```bash
cd /Users/pujan/Projects/simple-cdk
gh repo create pujaaan/simple-cdk --public --source=. --remote=origin --push
```

If `gh` isn't installed, create the repo on github.com first, then:

```bash
git remote add origin https://github.com/pujaaan/simple-cdk.git
git push -u origin main
```

### npm

You need an npm account that owns the `@simple-cdk` scope (or any scope you choose — update `name` fields in each `package.json` first).

```bash
npm login
# verify scope
npm whoami
```

If you haven't created the scope yet, the first `npm publish --access public` creates it.

## Publish all packages

```bash
npm run build              # always build first
npm run publish:all        # publishes every package in the workspace
```

`publish:all` runs `npm publish --workspaces --access public`. Order matters because adapters depend on `@simple-cdk/core`, but npm workspaces handle that.

## Bump versions

Pre-1.0, bump together — keep all packages on the same version:

```bash
npm version 0.0.2 --workspaces
git add . && git commit -m "release: v0.0.2"
git tag v0.0.2
git push --follow-tags
npm run publish:all
```

## What gets published

Each `package.json` declares `"files"`:

- All packages: `dist/`, `README.md`
- `@simple-cdk/cli`: also `bin/`

The `LICENSE` and `package.json` are always included. Source files (`src/`) and tests are not.

## Verify before publishing

```bash
npm pack -w @simple-cdk/core --dry-run
```

This shows exactly what would go into the tarball for `@simple-cdk/core`. Run it for each package the first time you publish to make sure nothing leaks.

## After first publish

- Add the npm version badge to the README
- Test the install in a scratch project: `mkdir /tmp/scdk-test && cd /tmp/scdk-test && npm init -y && npm install @simple-cdk/core @simple-cdk/cli`
- If anything's broken, fix and bump the patch version — never republish a deleted version
