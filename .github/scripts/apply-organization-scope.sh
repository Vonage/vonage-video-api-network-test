#!/usr/bin/env bash
# Expected working directory: lib/js
# Required env: ORGANIZATION
set -euo pipefail

CURRENT_NAME=$(node -p "require('./package.json').name")
# Strip scope prefix only if one is present, to avoid mangling unscoped names.
if [[ "$CURRENT_NAME" == @*/* ]]; then
  BASE_NAME="${CURRENT_NAME#@*/}"
else
  BASE_NAME="$CURRENT_NAME"
fi
if [ "$ORGANIZATION" == "unscoped" ]; then
  npm pkg set name="$BASE_NAME"
else
  npm pkg set name="@${ORGANIZATION}/${BASE_NAME}"
fi
