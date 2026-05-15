#!/usr/bin/env bash
# Finds the tarball in lib/js/ and extracts only the dist/ tree into lib/js/dist/.
# Expected working directory: repository root ($GITHUB_WORKSPACE)
set -euo pipefail

TARBALL=$(find lib/js -maxdepth 1 -name '*.tgz' | head -1)
mkdir -p lib/js/dist
tar xzf "$TARBALL" --wildcards --strip-components=2 -C lib/js/dist 'package/dist/*'
echo "Extracted dist:"
find lib/js/dist -type f | sort
