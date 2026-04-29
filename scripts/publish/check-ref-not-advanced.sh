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

# Validate REF as a branch name to prevent it being interpreted as a git
# flag (e.g. a value starting with '-') or a tag with the same short name.
if ! git check-ref-format --branch "$REF" >/dev/null 2>&1; then
  echo "❌ REF is not a valid branch name: $REF"
  exit 1
fi

# Read the current remote SHA directly. A plain `git fetch <refspec>`
# without an explicit destination is not guaranteed to update
# refs/remotes/origin/$REF, so reading the remote-tracking ref afterwards
# can return a stale SHA and defeat the guard.
REMOTE_SHA=$(git ls-remote origin "refs/heads/$REF" | awk '{print $1}')

if [ -z "$REMOTE_SHA" ]; then
  echo "❌ Could not resolve remote SHA for refs/heads/$REF"
  exit 1
fi

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
