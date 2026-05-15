#!/usr/bin/env bash
# Required env: GH_TOKEN, BEFORE (= github.event.before commit SHA)
# GITHUB_SHA is set automatically by the GitHub Actions runner.
# Guards against the first-ever run: if no published release exists, Release Drafter
# would scan the entire PR history. A baseline release anchors it so only PRs merged
# after this point are included in the next release's changelog.
set -euo pipefail

RELEASE_COUNT=$(gh release list --exclude-drafts --json tagName --jq 'length' 2>/dev/null || echo "0")
if [ "${RELEASE_COUNT:-0}" -eq 0 ]; then
  # Try the package source first, then the repo root, then fall back to 0.0.0.
  VERSION=$(node -p "require('./lib/js/package.json').version" 2>/dev/null || \
            node -p "require('./package.json').version" 2>/dev/null || \
            echo "0.0.0")
  # BEFORE is 0000...0 on the very first push (no previous commit).
  # Fall back to the current HEAD SHA in that case.
  TARGET=$([[ "$BEFORE" =~ ^0+$ ]] && echo "$GITHUB_SHA" || echo "$BEFORE")
  echo "No published releases found — creating baseline at v${VERSION} (target: $TARGET)"
  gh release create "v${VERSION}" \
    --title "v${VERSION}" \
    --notes "Baseline release — marks the starting point for automated changelog generation. PRs merged after this point will appear in the next release." \
    --target "$TARGET"
fi
