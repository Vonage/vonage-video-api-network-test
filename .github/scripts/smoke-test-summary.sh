#!/usr/bin/env bash
# Required env: VN, VG, ON, OG (step outcomes for the four smoke-test variants)
set -euo pipefail

status() {
  case "$1" in
    success)   echo "✅ \`ok\`" ;;
    skipped)   echo "⏭️ \`not published\`" ;;
    *)         echo "❌ \`$1\`" ;;
  esac
}
echo "### Smoke Test Summary" >> "$GITHUB_STEP_SUMMARY"
echo "| Variant | ESM + Function Call |" >> "$GITHUB_STEP_SUMMARY"
echo "|---|---|" >> "$GITHUB_STEP_SUMMARY"
echo "| \`@vonage/video-client-network-test\` → npmjs.com       | $(status "$VN") |" >> "$GITHUB_STEP_SUMMARY"
echo "| \`@vonage/video-client-network-test\` → GitHub Packages | $(status "$VG") |" >> "$GITHUB_STEP_SUMMARY"
echo "| \`opentok-network-test-js\` → npmjs.com                 | $(status "$ON") |" >> "$GITHUB_STEP_SUMMARY"
echo "| \`@opentok/opentok-network-test-js\` → GitHub Packages  | $(status "$OG") |" >> "$GITHUB_STEP_SUMMARY"

fails() { [ "$1" == "failure" ] || [ "$1" == "cancelled" ]; }
if fails "$VN" || fails "$VG" || fails "$ON" || fails "$OG"; then
  echo "::error::One or more smoke tests failed — see summary above."
  exit 1
fi
