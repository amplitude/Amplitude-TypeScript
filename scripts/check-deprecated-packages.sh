#!/bin/bash

# Script to check for new usage of deprecated packages in PRs
# Exits with error if new dependencies on analytics-types or analytics-client-common are detected

set -e

DEPRECATED_PACKAGES=("@amplitude/analytics-types" "@amplitude/analytics-client-common")
FAILED=0

echo "Checking for new usage of deprecated packages..."

# Get the list of changed package.json files
CHANGED_FILES=$(git diff --name-only origin/${GITHUB_BASE_REF:-main}...HEAD | grep 'package.json$' || true)

if [ -z "$CHANGED_FILES" ]; then
  echo "✓ No package.json files changed"
  exit 0
fi

echo "Changed package.json files:"
echo "$CHANGED_FILES"
echo ""

for FILE in $CHANGED_FILES; do
  if [ ! -f "$FILE" ]; then
    echo "Skipping deleted file: $FILE"
    continue
  fi

  echo "Checking $FILE..."
  
  for PACKAGE in "${DEPRECATED_PACKAGES[@]}"; do
    # Check if the package is present in the current version
    CURRENT_HAS=$(grep -c "\"$PACKAGE\"" "$FILE" || true)
    
    # Check if the package was present in the base branch
    BASE_HAS=$(git show origin/${GITHUB_BASE_REF:-main}:"$FILE" 2>/dev/null | grep -c "\"$PACKAGE\"" || true)
    
    # If it's newly added (present now but not before)
    if [ "$CURRENT_HAS" -gt 0 ] && [ "$BASE_HAS" -eq 0 ]; then
      echo "❌ ERROR: New dependency on deprecated package '$PACKAGE' detected in $FILE"
      echo "   Please use @amplitude/analytics-core instead"
      FAILED=1
    elif [ "$CURRENT_HAS" -gt 0 ] && [ "$BASE_HAS" -gt 0 ]; then
      echo "   ℹ️  Existing dependency on '$PACKAGE' found (grandfathered in)"
    fi
  done
done

if [ "$FAILED" -eq 1 ]; then
  echo ""
  echo "=========================================="
  echo "DEPRECATED PACKAGE CHECK FAILED"
  echo "=========================================="
  echo "New dependencies on the following packages are not allowed:"
  for PACKAGE in "${DEPRECATED_PACKAGES[@]}"; do
    echo "  - $PACKAGE"
  done
  echo ""
  echo "Please use @amplitude/analytics-core instead."
  echo "If you believe this is a false positive, please contact the team."
  exit 1
fi

echo ""
echo "✓ No new usage of deprecated packages detected"
exit 0

