#!/usr/bin/env bash
# Validates that a PR has at least one recognized release label.
# Required env: PR_LABELS (JSON array of label objects — github.event.pull_request.labels)
set -euo pipefail

# Labels that map to a release-drafter category or explicitly opt out of the changelog.
VALID="enhancement feature bug fix documentation chore maintenance dependencies other skip-changelog"

FOUND=$(echo "$PR_LABELS" | jq -r '.[].name' \
  | grep -Fx -f <(tr ' ' '\n' <<< "$VALID") \
  | head -1 || true)

if [ -z "$FOUND" ]; then
  echo "::error::No release label found on this PR."
  echo ""
  echo "Add one of: $VALID"
  echo ""
  echo "If the PR title starts with feat:, fix:, docs:, or chore:,"
  echo "Release Drafter will apply the correct label automatically."
  echo "Re-push or re-open the PR to trigger the autolabeler."
  exit 1
fi

echo "✅ Release label: $FOUND"
