#!/bin/bash

# Guard against the race where a PR merges to the publish ref between
# the e2e job's checkout and the lerna version push. If the ref has
# advanced past the SHA E2E ran against, the chore(release): publish
# commit would land on top of code this run never tested in E2E, making
# the git history misleading. Re-dispatch is the right recovery — it
# re-runs E2E against the new HEAD.
#
# Required env vars:
#   EXPECTED_SHA - the SHA the ref is expected to still be at
#                  (typically the e2e job's HEAD after checkout)
#   REF          - the branch name to compare against (e.g. main)

set -euo pipefail

if [ -z "${EXPECTED_SHA:-}" ] || [ -z "${REF:-}" ]; then
  echo "❌ EXPECTED_SHA and REF must be set in the environment."
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
# can return a stale SHA and defeat the guard. Capture the command's
# exit status explicitly so transient/auth failures surface a
# diagnosable error rather than just a bare non-zero exit from set -e.
# stderr is left to flow to the runner log so git's own error message
# (auth failure, network error, etc.) is visible above our own.
if ! LS_OUTPUT=$(git ls-remote origin "refs/heads/$REF"); then
  echo "❌ git ls-remote failed for origin refs/heads/$REF (see error above)"
  exit 1
fi

REMOTE_SHA=$(echo "$LS_OUTPUT" | awk '{print $1}')

if [ -z "$REMOTE_SHA" ]; then
  echo "❌ Could not resolve remote SHA for refs/heads/$REF on origin"
  exit 1
fi

if [ "$REMOTE_SHA" != "$EXPECTED_SHA" ]; then
  echo "❌ $REF has advanced since this run's E2E checkout."
  echo "   Expected SHA: $EXPECTED_SHA"
  echo "   Current $REF: $REMOTE_SHA"
  echo ""
  echo "A commit landed on $REF while this workflow was running. The"
  echo "chore(release): publish commit would appear after it in history,"
  echo "falsely implying the new commit was tested by this run's E2E."
  echo ""
  echo "Re-dispatch this workflow to include the new commits and re-run E2E."
  exit 1
fi

echo "✅ $REF is still at expected SHA: $EXPECTED_SHA"
