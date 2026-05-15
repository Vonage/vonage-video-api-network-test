#!/usr/bin/env bash
# Expected working directory: repository root ($GITHUB_WORKSPACE)
set -euo pipefail

SIZE=$(du -k samples/js/bundle.js | cut -f1)
echo "bundle.js: ${SIZE}KB"
if [ "$SIZE" -lt 10 ]; then
  echo "::error::bundle.js is ${SIZE}KB — suspiciously small"
  exit 1
fi
echo "✅ Sample built successfully (${SIZE}KB)"
