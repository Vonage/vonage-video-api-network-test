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

# --- ESM smoke test ---
# Loads the UMD bundle in a Node.js VM context (simulating the browser UMD global),
# then validates that NetworkTest is exported as a callable constructor and that its
# input validation throws MissingOpenTokInstanceError for invalid arguments.
# globalThis.self is shimmed so the UMD IIFE's `self === globalThis` check passes in Node.
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
  console.error('❌ NetworkTest not exported, got:', typeof NT);
  process.exit(1);
}

// Verify constructor input validation — no browser APIs involved here
try {
  new NT(null, { applicationId: 'a', sessionId: 'b', token: 'c' });
  console.error('❌ Expected MissingOpenTokInstanceError, nothing was thrown');
  process.exit(1);
} catch (e) {
  if (e.name !== 'MissingOpenTokInstanceError') {
    console.error('❌ Wrong error thrown:', e.name, '-', e.message);
    process.exit(1);
  }
}
console.log('✅ NetworkTest exported and constructor validation correct');
SMOKE

# --- CJS compatibility check ---
# The package ships as type:module + UMD. require() may fail with ERR_REQUIRE_ESM on
# some Node.js versions; this is a known limitation. A soft failure here emits a
# workflow notice rather than failing the smoke test.
CJS_OUT=$(node -e "require(process.env.PACKAGE_NAME)" 2>&1 || true)
if echo "$CJS_OUT" | grep -qE 'ERR_REQUIRE_ESM|ERR_REQUIRE_MODULE'; then
  echo "::notice::CJS require() not supported for ${PACKAGE_NAME} — known issue (type:module + UMD mismatch, tracked for future fix)"
elif [ -z "$CJS_OUT" ]; then
  echo "✅ CJS require() succeeded"
else
  echo "⚠️ CJS require() result: $CJS_OUT"
fi
