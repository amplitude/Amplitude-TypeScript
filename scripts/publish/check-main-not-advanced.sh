#!/bin/bash

# Guard against the race where a PR merges to the publish ref between
# workflow dispatch and the lerna version push. If the ref has advanced
# past the dispatch SHA, the chore(release): publish commit would land
# on top of code that this run never tested in E2E, making the git
# history misleading. Re-dispatch is the right recovery — it re-runs
# E2E against the new HEAD.
#
# Required env vars:
#   DISPATCH_SHA - the SHA captured at workflow dispatch (github.sha)
#   REF          - the branch name to compare against (e.g. main)

set -euo pipefail

if [ -z "${DISPATCH_SHA:-}" ] || [ -z "${REF:-}" ]; then
  echo "❌ DISPATCH_SHA and REF must be set in the environment."
  exit 1
fi

git fetch origin "$REF"
REMOTE_SHA=$(git rev-parse "origin/$REF")

if [ "$REMOTE_SHA" != "$DISPATCH_SHA" ]; then
  echo "❌ $REF has advanced since this publish was dispatched."
  echo "   Dispatch SHA:      $DISPATCH_SHA"
  echo "   Current $REF: $REMOTE_SHA"
  echo ""
  echo "A commit landed on $REF while this workflow was running. The"
  echo "chore(release): publish commit would appear after it in history,"
  echo "falsely implying the new commit was tested by this run's E2E."
  echo ""
  echo "Re-dispatch this workflow to include the new commits and re-run E2E."
  exit 1
fi

echo "✅ $REF is still at dispatch SHA: $DISPATCH_SHA"
