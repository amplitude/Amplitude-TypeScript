#!/usr/bin/env bash
#
# Point the Session Replay packages at a local checkout of amplitude/rrweb so an
# rrweb change can be tested here before it is released.
#
#   scripts/dev/link-local-rrweb.sh link   [path-to-rrweb]   # default: ../rrweb
#   scripts/dev/link-local-rrweb.sh unlink
#   scripts/dev/link-local-rrweb.sh status
#
# `link` adds `link:` entries for the @amplitude/rrweb-* packages to the
# `overrides` block of pnpm-workspace.yaml and re-installs. `unlink` restores
# pnpm-workspace.yaml and pnpm-lock.yaml from git and re-installs.
#
# Never commit the linked pnpm-workspace.yaml or pnpm-lock.yaml. CI installs with
# --frozen-lockfile and the paths only exist on your machine.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORKSPACE_FILE="pnpm-workspace.yaml"
LOCKFILE="pnpm-lock.yaml"
MARKER="# local-rrweb"

# package name -> directory inside the rrweb checkout
RRWEB_PACKAGES=(
  "@amplitude/rrweb-record:packages/record"
  "@amplitude/rrweb-types:packages/types"
  "@amplitude/rrweb-plugin-console-record:packages/plugins/rrweb-plugin-console-record"
)

cd "$REPO_ROOT"

is_linked() {
  grep -q "$MARKER" "$WORKSPACE_FILE"
}

link() {
  local rrweb_dir="${1:-$REPO_ROOT/../rrweb}"
  if [ ! -d "$rrweb_dir" ]; then
    echo "rrweb checkout not found: $rrweb_dir" >&2
    exit 1
  fi
  rrweb_dir="$(cd "$rrweb_dir" && pwd)"

  if is_linked; then
    echo "Already linked. Run 'unlink' first to change the rrweb path." >&2
    exit 1
  fi
  if ! git diff --quiet -- "$WORKSPACE_FILE" "$LOCKFILE"; then
    echo "$WORKSPACE_FILE or $LOCKFILE has uncommitted changes; commit or stash them first." >&2
    exit 1
  fi

  local overrides=""
  local entry name dir
  for entry in "${RRWEB_PACKAGES[@]}"; do
    name="${entry%%:*}"
    dir="${entry#*:}"
    if [ ! -f "$rrweb_dir/$dir/package.json" ]; then
      echo "Missing $rrweb_dir/$dir/package.json; is $rrweb_dir an amplitude/rrweb checkout?" >&2
      exit 1
    fi
    if [ ! -d "$rrweb_dir/$dir/dist" ]; then
      echo "Missing $rrweb_dir/$dir/dist; build rrweb first (pnpm install && pnpm build:all in $rrweb_dir)." >&2
      exit 1
    fi
    overrides+="  '$name': link:$rrweb_dir/$dir $MARKER\n"
  done

  # Append right after the `overrides:` key.
  awk -v block="$overrides" '{ print } /^overrides:$/ { printf "%s", block }' "$WORKSPACE_FILE" > "$WORKSPACE_FILE.tmp"
  mv "$WORKSPACE_FILE.tmp" "$WORKSPACE_FILE"

  pnpm install --no-frozen-lockfile
  echo
  echo "Linked @amplitude/rrweb-* to $rrweb_dir."
  echo "Rebuild rrweb after changing it, then re-run the tests, e.g.:"
  echo "  cd packages/session-replay-browser && RRWEB_LOCAL=true npx jest test/dom-privacy.test.ts --coverage=false"
  echo "Run '$0 unlink' when done."
}

unlink_rrweb() {
  git checkout -- "$WORKSPACE_FILE" "$LOCKFILE"
  pnpm install --frozen-lockfile
  echo "Restored published @amplitude/rrweb-* packages."
}

status() {
  if is_linked; then
    grep "$MARKER" "$WORKSPACE_FILE"
  else
    echo "Not linked."
  fi
}

case "${1:-}" in
  link) link "${2:-}" ;;
  unlink) unlink_rrweb ;;
  status) status ;;
  *)
    sed -n '3,15p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
