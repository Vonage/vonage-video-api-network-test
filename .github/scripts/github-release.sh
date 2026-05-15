#!/usr/bin/env bash
# Required env: GH_TOKEN, TAG, VERSION
# Promotes an existing Release Drafter draft if one exists, otherwise creates a fresh release.
# Idempotent: no-ops if the release tag already exists.
set -euo pipefail

if gh release view "$TAG" &>/dev/null; then
  echo "Release $TAG already exists — skipping."
  exit 0
fi

DRAFT_TAG=$(gh release list --json tagName,isDraft \
  --jq '[.[] | select(.isDraft==true)] | first | .tagName // empty')

if [ -n "$DRAFT_TAG" ]; then
  echo "Promoting draft '$DRAFT_TAG' → '$TAG'"
  gh release edit "$DRAFT_TAG" --tag "$TAG" --title "v${VERSION}" --draft=false
else
  echo "No draft found — creating release '$TAG'"
  gh release create "$TAG" --title "v${VERSION}" --generate-notes
fi
