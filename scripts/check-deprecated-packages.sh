#!/bin/bash

# Script to check for new usage of deprecated packages in PRs
# Exits with error if:
# - New dependencies on deprecated packages are detected
# - Code changes are made to deprecated package directories

set -e

DEPRECATED_PACKAGES=("@amplitude/analytics-types" "@amplitude/analytics-client-common" "@amplitude/analytics-remote-config")
DEPRECATED_PACKAGE_DIRS=("packages/analytics-types" "packages/analytics-client-common")
FAILED=0

echo "Checking for new usage of deprecated packages..."

# Check for code changes in deprecated package directories
echo "Checking for code changes in deprecated packages..."
for DIR in "${DEPRECATED_PACKAGE_DIRS[@]}"; do
  CHANGED_IN_DIR=$(git diff --name-only origin/${GITHUB_BASE_REF:-main}...HEAD | grep "^$DIR/" || true)
  
  if [ -n "$CHANGED_IN_DIR" ]; then
    echo "❌ ERROR: Code changes detected in deprecated package '$DIR'"
    echo "Changed files:"
    echo "$CHANGED_IN_DIR" | sed 's/^/   - /'
    echo ""
    FAILED=1
  fi
done

# Get the list of changed package.json files
CHANGED_FILES=$(git diff --name-only origin/${GITHUB_BASE_REF:-main}...HEAD | grep 'package.json$' || true)

if [ -z "$CHANGED_FILES" ]; then
  echo "✓ No package.json files changed"
else
  echo "Changed package.json files:"  
  echo "$CHANGED_FILES"
  echo ""
fi

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
      if [ "$PACKAGE" = "@amplitude/analytics-remote-config" ]; then
        echo "   Please use the new remote config client in @amplitude/analytics-core instead"
      else
        echo "   Please use @amplitude/analytics-core instead"
      fi
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
  echo "The following packages are deprecated:"
  for PACKAGE in "${DEPRECATED_PACKAGES[@]}"; do
    echo "  - $PACKAGE"
  done
  echo ""
  echo "Restrictions:"
  echo "  • No new dependencies on these packages are allowed"
  echo "  • No code changes to packages/analytics-types or packages/analytics-client-common are allowed"
  echo ""
  echo "For @amplitude/analytics-types and @amplitude/analytics-client-common:"
  echo "  → Use @amplitude/analytics-core instead"
  echo ""
  echo "For @amplitude/analytics-remote-config:"
  echo "  → Use the new remote config client in @amplitude/analytics-core instead"
  echo ""
  echo "If you believe this is a false positive, please contact the team."
  exit 1
fi

echo ""
echo "✓ No new usage of deprecated packages detected"
echo "✓ No code changes in deprecated packages detected"
exit 0

