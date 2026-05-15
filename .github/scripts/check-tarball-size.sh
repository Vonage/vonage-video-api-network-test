#!/usr/bin/env bash
# Required env: TARBALL
set -euo pipefail

SIZE_KB=$(du -k "$TARBALL" | cut -f1)
FILE_COUNT=$(tar tzf "$TARBALL" | wc -l)
echo "Tarball size: ${SIZE_KB}KB, files: $FILE_COUNT"
if [ "$SIZE_KB" -gt 2000 ]; then
  echo "::error::Tarball is ${SIZE_KB}KB — suspiciously large, possible node_modules inclusion"
  exit 1
fi
if [ "$SIZE_KB" -lt 5 ]; then
  echo "::error::Tarball is ${SIZE_KB}KB — suspiciously small, dist may be missing"
  exit 1
fi
echo "✅ Size OK (${SIZE_KB}KB, $FILE_COUNT files)"
