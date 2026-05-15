#!/usr/bin/env bash
# extract-tarball.sh [--mode=MODE]
#
# Modes (default: full):
#   full — Extracts the full package into lib/js/, stripping the 'package/' prefix
#           added by npm pack, then deletes the tarball. Used by the publish flow.
#   dist — Extracts only the dist/ subtree into lib/js/dist/. Used by sample-build
#           and test-dist jobs to run tests/builds against the packaged artifact.
#   umd  — Extracts the full package into /tmp/pw-test and writes the UMD bundle
#           path to GITHUB_OUTPUT. Used by the browser-test job.
#
# Expected working directory: repository root ($GITHUB_WORKSPACE)
set -euo pipefail

MODE="full"
for arg in "$@"; do
  case "$arg" in
    --mode=*) MODE="${arg#--mode=}" ;;
    *) echo "::error::Unknown argument: $arg"; exit 1 ;;
  esac
done

TARBALL=$(find lib/js -maxdepth 1 -name '*.tgz' | head -1)
if [ -z "$TARBALL" ]; then
  echo "::error::No tarball found in lib/js/"
  exit 1
fi

case "$MODE" in
  full)
    # Strip the package/ prefix that npm pack adds, extract in-place, then delete
    # the tarball so npm does not try to publish the .tgz file itself.
    tar -xzf "$TARBALL" --strip-components=1 -C lib/js
    rm "$TARBALL"
    ;;
  dist)
    rm -rf lib/js/dist
    mkdir -p lib/js/dist
    tar xzf "$TARBALL" --wildcards --strip-components=2 -C lib/js/dist 'package/dist/*'
    echo "Extracted dist:"
    find lib/js/dist -type f | sort
    ;;
  umd)
    mkdir -p /tmp/pw-test
    tar xzf "$TARBALL" -C /tmp/pw-test --strip-components=1
    BUNDLE=$(find /tmp/pw-test/dist -name 'index.js' ! -name '*.map' | head -1)
    if [ -z "$BUNDLE" ]; then
      echo "::error::No index.js found in extracted dist — tarball may be malformed"
      find /tmp/pw-test -type f | sort
      exit 1
    fi
    echo "bundle=$BUNDLE" >> "$GITHUB_OUTPUT"
    echo "Bundle: $BUNDLE"
    ;;
  *)
    echo "::error::Unknown mode '$MODE'. Valid modes: full, dist, umd."
    exit 1
    ;;
esac
