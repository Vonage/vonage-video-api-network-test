#!/usr/bin/env bash
# check-size.sh <file> <min_kb> <max_kb>
# Guards against files that are suspiciously small (empty/missing content)
# or suspiciously large (e.g. node_modules accidentally bundled in).
set -euo pipefail

FILE="$1"
MIN_KB="$2"
MAX_KB="$3"

SIZE_KB=$(du -k "$FILE" | cut -f1)
EXTRA=""
if [[ "$FILE" == *.tgz ]]; then
  FILE_COUNT=$(tar tzf "$FILE" | wc -l)
  EXTRA=", $FILE_COUNT files"
fi
echo "$(basename "$FILE"): ${SIZE_KB}KB${EXTRA}"

if [ "$SIZE_KB" -gt "$MAX_KB" ]; then
  echo "::error::$(basename "$FILE") is ${SIZE_KB}KB — suspiciously large (max ${MAX_KB}KB, possible node_modules inclusion)"
  exit 1
fi
if [ "$SIZE_KB" -lt "$MIN_KB" ]; then
  echo "::error::$(basename "$FILE") is ${SIZE_KB}KB — suspiciously small (min ${MIN_KB}KB, dist may be missing)"
  exit 1
fi
echo "✅ Size OK (${SIZE_KB}KB${EXTRA})"
