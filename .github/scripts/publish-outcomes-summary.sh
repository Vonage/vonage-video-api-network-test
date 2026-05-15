#!/usr/bin/env bash
# Computes boolean publish outcomes (written to GITHUB_OUTPUT for the smoke-test job),
# writes the publish summary table to GITHUB_STEP_SUMMARY, and fails the job if any
# selected variant errored or if a specific-target publish found an already-published version.
#
# Required env: TARGET,
#               VONAGE_NPMJS,  VONAGE_NPMJS_SKIP,
#               VONAGE_GITHUB, VONAGE_GITHUB_SKIP,
#               OPENTOK_NPMJS, OPENTOK_NPMJS_SKIP,
#               OPENTOK_GITHUB, OPENTOK_GITHUB_SKIP
set -euo pipefail

# --- Compute outputs ---
# A variant is "published: true" only when its step succeeded AND it was not skipped
# as an already-published duplicate. These outputs gate the smoke-test job.
published() { [ "$1" == "success" ] && [ "$2" != "true" ] && echo "true" || echo "false"; }
echo "vonage-npmjs=$(published  "$VONAGE_NPMJS"   "$VONAGE_NPMJS_SKIP")"  >> "$GITHUB_OUTPUT"
echo "vonage-github=$(published "$VONAGE_GITHUB"  "$VONAGE_GITHUB_SKIP")" >> "$GITHUB_OUTPUT"
echo "opentok-npmjs=$(published "$OPENTOK_NPMJS"  "$OPENTOK_NPMJS_SKIP")" >> "$GITHUB_OUTPUT"
echo "opentok-github=$(published "$OPENTOK_GITHUB" "$OPENTOK_GITHUB_SKIP")" >> "$GITHUB_OUTPUT"

# --- Write summary table ---
status() {
  local outcome="$1" skip="$2"
  if   [ "$outcome" == "skipped" ];                           then echo "⏭️ \`not selected\`"
  elif [ "$outcome" == "success" ] && [ "$skip" == "true" ];  then echo "ℹ️ \`already published, skipped\`"
  elif [ "$outcome" == "success" ];                           then echo "✅ \`published\`"
  else                                                             echo "❌ \`$outcome\`"
  fi
}
{
  echo "### Publish Summary"
  echo "| Variant | Outcome |"
  echo "|---|---|"
  echo "| \`@vonage/video-client-network-test\` → npmjs.com       | $(status "$VONAGE_NPMJS"  "$VONAGE_NPMJS_SKIP") |"
  echo "| \`@vonage/video-client-network-test\` → GitHub Packages | $(status "$VONAGE_GITHUB" "$VONAGE_GITHUB_SKIP") |"
  echo "| \`opentok-network-test-js\` → npmjs.com                 | $(status "$OPENTOK_NPMJS"  "$OPENTOK_NPMJS_SKIP") |"
  echo "| \`@opentok/opentok-network-test-js\` → GitHub Packages  | $(status "$OPENTOK_GITHUB" "$OPENTOK_GITHUB_SKIP") |"
} >> "$GITHUB_STEP_SUMMARY"

# --- Assert no failures ---
fails() { [ "$1" == "failure" ] || [ "$1" == "cancelled" ]; }
if fails "$VONAGE_NPMJS" || fails "$VONAGE_GITHUB" || \
   fails "$OPENTOK_NPMJS" || fails "$OPENTOK_GITHUB"; then
  echo "::error::One or more publish steps failed — see summary above."
  exit 1
fi

# When publishing a specific target (not "all"), treat already-published as an error:
# the user explicitly chose a single variant, so a duplicate publish is unexpected.
if [ "$TARGET" != "all" ]; then
  if [ "$VONAGE_NPMJS_SKIP" == "true" ] || [ "$VONAGE_GITHUB_SKIP" == "true" ] || \
     [ "$OPENTOK_NPMJS_SKIP" == "true" ] || [ "$OPENTOK_GITHUB_SKIP" == "true" ]; then
    echo "::error::Version is already published — cannot re-publish with a specific target."
    exit 1
  fi
fi
