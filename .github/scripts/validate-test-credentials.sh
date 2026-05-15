#!/usr/bin/env bash
# Required env: TARGET, VONAGE_PRIVATE_KEY, TEST_API_KEY, TEST_API_SECRET
set -euo pipefail

if [ "$TARGET" == "vonage" ]; then
  if [ -z "$VONAGE_PRIVATE_KEY" ]; then
    echo "❌ vonage_private_key is empty or not set"
    exit 1
  fi
  echo "$VONAGE_PRIVATE_KEY" > lib/js/private.key
elif [ "$TARGET" == "opentok" ]; then
  if [ -z "$TEST_API_KEY" ] || [ -z "$TEST_API_SECRET" ]; then
    echo "❌ test_api_key and test_api_secret are required for opentok target"
    exit 1
  fi
fi
