#!/usr/bin/env bash
# Expected working directory: lib/js
# Required env: TAG
set -euo pipefail

PACKAGE_NAME=$(node -p "require('./package.json').name")
CURRENT_VERSION=$(node -p "require('./package.json').version")

ALL_VERSIONS=$(npm view "${PACKAGE_NAME}" versions --json 2>/dev/null || echo "[]")
ALL_VERSIONS="${ALL_VERSIONS:-[]}"

PRERELEASE_NUM=$(
  ALL_VERSIONS="$ALL_VERSIONS" BASE_VERSION="$CURRENT_VERSION" TAG_NAME="$TAG" \
    node "$GITHUB_WORKSPACE/.github/scripts/next-prerelease-number.mjs"
)

npm pkg set version="${CURRENT_VERSION}-${TAG}.${PRERELEASE_NUM}"
