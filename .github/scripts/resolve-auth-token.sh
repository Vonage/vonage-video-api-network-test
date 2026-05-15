#!/usr/bin/env bash
set -euo pipefail

# NODE_AUTH_TOKEN is read automatically by npm when publishing.
if [ "$REGISTRY" == "github.com" ]; then
  if [ -z "$GH_PACKAGES_TOKEN" ]; then
    echo "❌ Error: github_packages_token is required when publishing to github.com"
    exit 1
  fi
  echo "NODE_AUTH_TOKEN=$GH_PACKAGES_TOKEN" >> "$GITHUB_ENV"
else
  if [ -z "$NPM_TOKEN" ]; then
    echo "❌ Error: npm_token is required when publishing to npmjs.com"
    exit 1
  fi
  echo "NODE_AUTH_TOKEN=$NPM_TOKEN" >> "$GITHUB_ENV"
fi
