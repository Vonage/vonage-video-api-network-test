#!/usr/bin/env bash
# Expected working directory: lib/js
# Required env: DRY_RUN, TAG, REGISTRY
set -euo pipefail

if [ "$DRY_RUN" == "true" ]; then
  # npm publish --dry-run contacts the registry and rejects duplicate versions,
  # making it unusable for testing against already-published artifacts.
  # npm pack --dry-run is fully local and shows the same tarball summary.
  echo "Dry run: showing package contents (no registry contact)"
  npm pack --dry-run
else
  PUBLISH_ARGS=(publish --access public)
  if [ -n "$TAG" ]; then
    PUBLISH_ARGS+=(--tag "$TAG")
  fi
  echo "Publishing to $REGISTRY: npm ${PUBLISH_ARGS[*]}"
  npm "${PUBLISH_ARGS[@]}"
fi
