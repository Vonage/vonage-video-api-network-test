#!/usr/bin/env bash
# Installs a published package variant from its registry and validates the exported API.
# Required env: PACKAGE_NAME, VERSION, REGISTRY, SCOPE, TOKEN
set -euo pipefail

DIR=$(mktemp -d) && cd "$DIR"
npm init -y --quiet

# Configure the GitHub Packages registry for scoped installs.
# Not needed for npmjs.com — it is the default registry.
if [ "$REGISTRY" == "github" ]; then
  printf '%s:registry=https://npm.pkg.github.com/\n//npm.pkg.github.com/:_authToken=%s\n' \
    "$SCOPE" "$TOKEN" > .npmrc
fi

npm install "${PACKAGE_NAME}@${VERSION}" --quiet

# --- CJS smoke test ---
# The UMD bundle handles require() via its CommonJS shim. No "type":"module" in the
# package means Node.js loads dist/index.js as CJS and the UMD shim fires correctly.
node -e "
  const mod = require(process.env.PACKAGE_NAME);
  const NT = mod.default ?? mod;
  if (typeof NT !== 'function') {
    console.error('❌ CJS: NetworkTest not exported, got:', typeof NT);
    process.exit(1);
  }
  try {
    new NT(null, { applicationId: 'a', sessionId: 'b', token: 'c' });
    console.error('❌ CJS: Expected MissingOpenTokInstanceError, nothing thrown');
    process.exit(1);
  } catch (e) {
    if (e.name !== 'MissingOpenTokInstanceError') {
      console.error('❌ CJS: Wrong error:', e.name, '-', e.message);
      process.exit(1);
    }
  }
  console.log('✅ CJS require() succeeded — NetworkTest exported and validation correct');
"

# --- ESM smoke test ---
# Uses dynamic import() so Node.js resolves via the package's exports.import condition,
# which routes to dist/index.mjs (the native ES module bundle).
node --input-type=module << 'SMOKE'
const pkgName = process.env.PACKAGE_NAME;
const mod = await import(pkgName);
const NT = mod.default;

if (typeof NT !== 'function') {
  console.error('❌ ESM: NetworkTest not exported as default, got:', typeof NT);
  process.exit(1);
}

// Verify constructor input validation — no browser APIs involved at this point
try {
  new NT(null, { applicationId: 'a', sessionId: 'b', token: 'c' });
  console.error('❌ ESM: Expected MissingOpenTokInstanceError, nothing thrown');
  process.exit(1);
} catch (e) {
  if (e.name !== 'MissingOpenTokInstanceError') {
    console.error('❌ ESM: Wrong error:', e.name, '-', e.message);
    process.exit(1);
  }
}

// Verify named export
if (!mod.ErrorNames || typeof mod.ErrorNames !== 'object') {
  console.error('❌ ESM: ErrorNames not exported');
  process.exit(1);
}
console.log('✅ ESM import() succeeded — NetworkTest and ErrorNames exported correctly');
SMOKE

# --- UMD browser simulation ---
# Loads the UMD bundle in a Node.js VM context, simulating a browser <script> tag.
# Validates the UMD global (globalThis.OpenTokNetworkConnectivity) is set correctly.
node --input-type=module << 'SMOKE'
import { readFileSync } from 'node:fs';
import { runInThisContext } from 'node:vm';

const pkgName = process.env.PACKAGE_NAME;
const pkg = JSON.parse(readFileSync(`./node_modules/${pkgName}/package.json`, 'utf-8'));
const code = readFileSync(`./node_modules/${pkgName}/${pkg.main}`, 'utf-8');

// UMD bundle sets globalThis.OpenTokNetworkConnectivity (self===globalThis in Node.js 24+)
globalThis.self ??= globalThis;
runInThisContext(code);

const bundle = globalThis.OpenTokNetworkConnectivity;
const NT = bundle?.default ?? bundle;
if (typeof NT !== 'function') {
  console.error('❌ UMD: NetworkTest not set as global, got:', typeof NT);
  process.exit(1);
}
console.log('✅ UMD browser simulation — OpenTokNetworkConnectivity global set correctly');
SMOKE

