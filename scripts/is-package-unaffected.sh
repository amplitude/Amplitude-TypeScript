#!/bin/sh
# Exit 0 if the package is in the nx affected set, 1 if not affected, 2+ on nx/env failure.
PACKAGE="$1"
if [ -z "$PACKAGE" ]; then
  echo "usage: is-package-unaffected.sh <package-name>" >&2
  exit 2
fi

pnpm exec nx show projects --affected --base="$NX_BASE" --head="$NX_HEAD" | grep "$PACKAGE"
if [ $? -eq 0 ]; then
  exit 0
else
  exit 1
fi