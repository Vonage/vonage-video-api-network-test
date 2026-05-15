#!/usr/bin/env bash
# Required env: GH_TOKEN, REPOSITORY, RUN_ID
set -euo pipefail

if ! RUN_JSON=$(gh api "repos/${REPOSITORY}/actions/runs/${RUN_ID}" 2>&1); then
  echo "::error::Could not fetch run ${RUN_ID}: $RUN_JSON"
  exit 1
fi
WORKFLOW=$(echo "$RUN_JSON" | jq -r '.name')
CONCLUSION=$(echo "$RUN_JSON" | jq -r '.conclusion')
STATUS=$(echo "$RUN_JSON"   | jq -r '.status')

echo "Run ID:     ${RUN_ID}"
echo "Workflow:   $WORKFLOW"
echo "Status:     $STATUS"
echo "Conclusion: $CONCLUSION"

if [ "$WORKFLOW" != "Post Merge Validation" ]; then
  echo "::error::run_id ${RUN_ID} belongs to '$WORKFLOW'."
  echo "::error::Only artifacts from a successful 'Post Merge Validation' run may be published."
  exit 1
fi
if [ "$CONCLUSION" != "success" ]; then
  echo "::error::run_id ${RUN_ID} did not succeed (conclusion: $CONCLUSION)."
  echo "::error::Cannot publish from a failed or incomplete run."
  exit 1
fi
echo "✅ Verified: run ${RUN_ID} is a successful Post Merge Validation run"
