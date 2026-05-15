#!/usr/bin/env bash
# Expected working directory: lib/js
# Required env: REGISTRY
set -euo pipefail

PACKAGE_NAME=$(node -p "require('./package.json').name")
PACKAGE_VERSION=$(node -p "require('./package.json').version")

# .npmrc is already configured for the correct registry by Setup Node.
PUBLISHED_VERSION=$(npm view "${PACKAGE_NAME}@${PACKAGE_VERSION}" version 2>/dev/null || echo "")

if [ "$PUBLISHED_VERSION" == "$PACKAGE_VERSION" ]; then
  echo "ℹ️ Version $PACKAGE_VERSION is already published on $REGISTRY — skipping."
  echo "already_published=true" >> "$GITHUB_OUTPUT"
else
  echo "already_published=false" >> "$GITHUB_OUTPUT"
fi
