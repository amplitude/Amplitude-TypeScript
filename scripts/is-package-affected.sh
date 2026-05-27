#!/bin/sh
# Exit 0 if the package is in the nx affected set, 1 if not affected, 2+ on nx/env failure.
PACKAGE="$1"
if [ -z "$PACKAGE" ]; then
  echo "usage: is-package-affected.sh <package-name>" >&2
  exit 2
fi

AFFECTED=$(pnpm exec nx show projects --affected --base=main --head=HEAD 2>&1)
nx_exit=$?

if [ "$nx_exit" -ne 0 ]; then
  echo "$AFFECTED" >&2
  exit 2
fi

if echo "$AFFECTED" | grep -Fxq "$PACKAGE"; then
  exit 0
fi

exit 1
