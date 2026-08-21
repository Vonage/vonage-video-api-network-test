# AGENTS.md

This file provides guidance for AI agents working with the vonage-video-api-network-test codebase.

## Project Overview

A precall network test library for applications using the Vonage Video API platform. It provides two primary tests:

- **Connectivity Test** — verifies that a client can connect to a Vonage Video API session, publish, and subscribe.
- **Quality Test** — measures audio/video bitrate, packet loss, MOS score, and recommends resolution/frame rate.

The library is published under four package variants:

| Package | Registry |
|---------|----------|
| `@vonage/video-client-network-test` | GitHub Packages |
| `@vonage/video-client-network-test` | npmjs.com |
| `@opentok/opentok-network-test-js` | GitHub Packages |
| `opentok-network-test-js` (unscoped) | npmjs.com |

The OpenTok variants are produced by applying `opentok.patch` to the Vonage source before building.

## Tech Stack

- **Runtime**: Node.js v24.10.0 (see `lib/js/.nvmrc`)
- **Language**: TypeScript (ES6 target)
- **Bundler**: Webpack 5 (produces UMD + ESM bundles)
- **Testing**: Karma + Jasmine (browser-based tests)
- **Linting**: ESLint with `@typescript-eslint`
- **Video SDK**: `@vonage/client-sdk-video` (dev peer; `@opentok/client` for the OpenTok variant)
- **Package Registries**: GitHub Packages (`@vonage`, `@opentok` scopes) and npmjs.com

## Build Output & Module Formats

Webpack produces two bundles from `src/index.ts`:

| File | Format | Consumer |
|------|--------|----------|
| `dist/index.js` | UMD | `<script>` tags, AMD loaders, CJS `require()` |
| `dist/index.mjs` | ESM | Native `import`, modern bundlers (Vite, Rollup, webpack 5) |
| `dist/index.d.ts` | TypeScript declarations | Type-checking and IDE support |

`package.json` exposes these via `main`, `module`, `types`, and the `exports` map.

## Project Structure

```
lib/js/
├── src/
│   ├── index.ts                      # Main NetworkTest class entry point
│   ├── errors/                       # Shared error classes
│   │   ├── index.ts
│   │   └── types.ts
│   ├── testConnectivity/             # Connectivity test module
│   │   ├── index.ts
│   │   └── errors/
│   ├── testQuality/                  # Quality test module
│   │   ├── index.ts
│   │   ├── types/
│   │   │   └── stats.ts
│   │   ├── errors/
│   │   └── helpers/
│   │       ├── MOSState.ts
│   │       ├── calculateBitrates.ts
│   │       ├── calculateQualityStats.ts
│   │       ├── calculateThroughput.ts
│   │       ├── config.ts
│   │       ├── getPublisherRtcStatsReport.ts
│   │       ├── getUpdateCallbackStats.ts
│   │       ├── getVideoQualityEvaluation.ts
│   │       ├── subscriberMOS.ts
│   │       └── ...
│   ├── types/                        # Shared type definitions
│   └── util.ts                       # Shared utility functions
├── test/                             # Karma/Jasmine test specs
│   └── dist-tests/                   # Integration tests for built bundles
│       ├── dist.spec.ts              # UMD bundle import test
│       └── dist-esm.spec.ts          # ESM bundle import test
├── karma.conf.mjs                    # Unit test karma config
├── karma.conf.dist.mjs               # UMD dist integration test config
├── karma.conf.dist.esm.mjs           # ESM dist integration test config
├── webpack.config.mjs
├── tsconfig.json
├── opentok.patch                     # Transforms vonage source into opentok variant
└── package.json
```

## Common Commands

All commands are run from `lib/js/`:

| Task | Command |
|------|---------|
| Install dependencies | `npm install` |
| Build (JS + types) | `npm run build` |
| Build JS only | `npm run build:js` |
| Build type declarations | `npm run build:types` |
| Run unit tests | `npm test` |
| Run dist bundle tests | `npm run test:dist` |
| Verify UMD bundle | `npm run karma:dist` |
| Verify ESM bundle | `npm run karma:dist:esm` |
| Lint | `npm run lint` |
| Lint with fix | `npm run lint-fix` |
| Run sample app | `npm run example` |

## Coding Conventions

### Code Comments & Documentation Style

The codebase follows a **minimal, plain-language comment style**. These rules must be respected when adding or modifying comments:

- **Keep comments short and descriptive.** A comment should state *what* a function or block does, not exhaustively document its implementation details.
- **Use JSDoc block format** (`/** ... */`) for function-level documentation. Single-line for short descriptions, multi-line for longer ones.
- **Do NOT use TSDoc-specific tags** such as `@remarks`, `@returns`, `@link`, `@example`, `@typeParam`, or `@see`. These are not part of the established convention.
- **`@param` is allowed sparingly** — only when the parameter name alone is not self-explanatory. Do not annotate types in `@param` (TypeScript provides that).
- **`@module` and `@preferred`** are used only at the top of module entry-point files (`index.ts`).
- **Internal/private helper functions** within a file do NOT receive doc comments. Only exported functions or "section-heading" functions (those that introduce a logical section of the file) get them.
- **Do not duplicate type information in comments.** TypeScript signatures are the source of truth for types; comments describe intent and behavior.
- **Inline comments** (`//`) are used for brief clarifications within function bodies. Keep them to one line when possible.

#### Correct examples (matching existing convention)

```typescript
/**
 * If not already connected, connect to the Vonage Video API Session
 */
function connectToSession(session: OT.Session, token: string): Promise<OT.Session> {
```

```typescript
/**
 * Disconnect from a session. Once disconnected, remove all session
 * event listeners and invoke the provided callback function.
 */
function disconnectFromSession(session: OT.Session): Promise<void> {
```

```typescript
/**
 * Clean subscriber objects before disconnecting from the session
 * @param session
 * @param subscriber
 */
function cleanSubscriber(session: OT.Session, subscriber: OT.Subscriber): Promise<void> {
```

```typescript
/**
 * Ensure that audio and video devices are available
 */
function validateDevices(OTInstance: typeof OT): Promise<AvailableDevices> {
```

#### Incorrect examples (violating convention)

```typescript
// BAD: uses @remarks, @returns, @param with type annotations, markdown tables
/**
 * Classifies the media routing path from the active ICE candidate pair.
 *
 * @param localCandidate - Local ICE candidate from the active pair, or `null`
 *   if stats are not yet available (valid transient state during ICE ramp-up).
 * @param remoteCandidate - Remote ICE candidate from the active pair, or `null`.
 * @returns A {@link MediaRouting} string — `'Unknown'` when either candidate is `null`.
 *
 * @remarks
 * | Local type | Remote type | Result |
 * |---|---|---|
 * | `host` / `prflx` | `host` | `'Routed'` |
 */
```

```typescript
// BAD: multi-paragraph explanation with @remarks and @returns
/**
 * Determines the sustained `qualityLimitationReason` across all samples.
 *
 * @remarks
 * The WebRTC encoder can transiently report `"bandwidth"` during ramp-up...
 *
 * @returns The most frequently occurring non-trivial reason if it exceeds the
 * majority threshold, otherwise `undefined`.
 */
```

### General Style

- **Module system**: TypeScript compiled to UMD (CJS-compatible) and ESM bundles
- **Formatting**: 2-space indentation (enforced by ESLint)
- **Naming**: camelCase for functions/variables, PascalCase for classes/interfaces/types
- **Error classes**: extend `NetworkTestError` (in `src/errors/index.ts`)
- **Exports**: default exports for helper functions, named exports for types/interfaces
- **No barrel re-exports**: each module imports directly from its source file

## Testing Guidelines

- Tests run in real browsers via Karma (Chrome, Firefox, Safari)
- Unit test specs live in `lib/js/test/` and use the `.spec.ts` suffix
- Dist integration tests live in `lib/js/test/dist-tests/` and verify the built UMD and ESM bundles are importable and expose the expected public API
- A test setup script (`test/setup/setup.js`) generates session credentials before tests run
- Test environment config is in `lib/js/.env`

## Important Notes

- The `.npmrc` or GitHub token setup is required to install `@opentok` scoped packages
- The `opentok.patch` file transforms the Vonage source into the OpenTok variant (branding, SDK swaps); it is applied automatically by the CI `setup-environment` action for the `opentok` matrix target
- Build output goes to `lib/js/dist/` and is checked into the repository under `dist/`
- The library is designed to run in browser environments only (uses `window`, `navigator`, DOM APIs)

## CI/CD Pipeline

GitHub Actions workflows are located in `.github/workflows/`. Reusable composite actions live in `.github/actions/`.

### Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `ci-pull-request.yml` | Pull requests | Lint, test, build, verify bundles (matrix: vonage, opentok) |
| `post-merge-validation.yml` | Push to main/release-* | Test, build, verify bundles, package tarballs, verify artifacts |
| `publish-package.yml` | Manual dispatch | Publish a target/registry combination from a CI artifact |
| `release-management.yml` | Push to main + PR events | Maintains release draft via Release Drafter |

### Composite Actions

| Action | Purpose |
|--------|---------|
| `setup-environment` | Node setup, npmrc config, patch application, dependency install/cache |
| `restore-node-modules` | Cache-based node_modules restore with fallback to `npm ci` |
| `run-test` | Credential validation + `npm test` |
| `build-and-package-library` | Setup → Build → Verify Bundles → Package tarball |
| `verify-bundles` | Runs dist integration tests (UMD + ESM) against built bundles |
| `package-tarball` | `npm pack` + upload artifact |
| `publish-package` | Downloads artifact, applies scope/tag, publishes to registry |

### Publish Matrix

The `publish-package.yml` workflow handles all four package variants via `target` and `registry` inputs:

| Target | Registry | Resulting Package |
|--------|----------|-------------------|
| vonage | github.com | `@vonage/video-client-network-test` |
| vonage | npmjs.com | `@vonage/video-client-network-test` |
| opentok | github.com | `@opentok/opentok-network-test-js` |
| opentok | npmjs.com | `opentok-network-test-js` (unscoped) |
