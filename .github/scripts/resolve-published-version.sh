#!/usr/bin/env bash
# Reads the final published version and name from lib/js/package.json and sets
# version, package_name, and tag outputs for the downstream GitHub Release step.
# Expected working directory: repository root ($GITHUB_WORKSPACE)
set -euo pipefail

VERSION=$(node -p "require('./lib/js/package.json').version")
NAME=$(node -p "require('./lib/js/package.json').name")

echo "version=$VERSION"    >> "$GITHUB_OUTPUT"
echo "package_name=$NAME"  >> "$GITHUB_OUTPUT"
# All targets share the same version tag so that publishing vonage and opentok
# variants of the same version produces a single GitHub Release.
echo "tag=v${VERSION}"     >> "$GITHUB_OUTPUT"
