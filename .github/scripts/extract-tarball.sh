#!/usr/bin/env bash
# Expected working directory: lib/js
set -euo pipefail

mapfile -t TARBALLS < <(find . -maxdepth 1 -name '*.tgz')
if [ "${#TARBALLS[@]}" -ne 1 ]; then
  echo "❌ Expected exactly 1 tarball, found ${#TARBALLS[@]}"
  exit 1
fi
TARBALL="${TARBALLS[0]}"
# Extract, stripping the package/ prefix that npm pack adds
tar -xzf "$TARBALL" --strip-components=1
# Remove tarball to prevent npm from trying to publish the file itself
rm "$TARBALL"
