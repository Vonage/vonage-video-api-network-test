#!/usr/bin/env bash
# Finds the tarball in lib/js/, extracts the full package into /tmp/pw-test,
# and outputs the path of the UMD bundle (dist/index.js) to GITHUB_OUTPUT.
# Expected working directory: repository root ($GITHUB_WORKSPACE)
set -euo pipefail

TARBALL=$(find lib/js -maxdepth 1 -name '*.tgz' | head -1)
if [ -z "$TARBALL" ]; then
  echo "::error::No tarball found in lib/js/"
  exit 1
fi

mkdir -p /tmp/pw-test
tar xzf "$TARBALL" -C /tmp/pw-test --strip-components=1

BUNDLE=$(find /tmp/pw-test/dist -name 'index.js' ! -name '*.map' | head -1)
if [ -z "$BUNDLE" ]; then
  echo "::error::No index.js found in extracted dist — tarball may be malformed"
  find /tmp/pw-test -type f | sort
  exit 1
fi

echo "bundle=$BUNDLE" >> "$GITHUB_OUTPUT"
echo "Bundle: $BUNDLE"
