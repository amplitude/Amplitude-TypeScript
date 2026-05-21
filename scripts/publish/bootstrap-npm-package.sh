#!/usr/bin/env bash
#
# Bootstrap a new @amplitude package on npm for Trusted Publishing.
#
# GitHub Actions cannot publish a package that does not exist on npm yet.
# This script publishes a one-time empty package (package.json only) using
# your npm account and 2FA. After that, configure Trusted Publishing on npm
# and use the normal publish workflows for real releases.
#
# Prerequisites:
#   - npm login (admin account with publish + 2FA)
#   - package name must not already exist on npm
#
# Usage:
#   bash scripts/publish/bootstrap-npm-package.sh

set -euo pipefail

cleanup() {
  if [ -n "${WORK_DIR:-}" ] && [ -d "$WORK_DIR" ]; then
    rm -rf "$WORK_DIR"
  fi
}
trap cleanup EXIT

echo "Bootstrap npm package for Trusted Publishing"
echo "----------------------------------------------"
echo ""
echo "This publishes an empty package (package.json only) so the name"
echo "exists on npm before enabling Trusted Publishing in package settings."
echo ""

if ! command -v npm >/dev/null 2>&1; then
  echo "❌ npm is required but was not found in PATH."
  exit 1
fi

if ! npm whoami >/dev/null 2>&1; then
  echo "❌ Not logged in to npm. Run: npm login"
  exit 1
fi

echo "Logged in to npm as: $(npm whoami)"
echo ""

read -r -p "Package name to publish (e.g. @amplitude/my-new-package): " PACKAGE_NAME
PACKAGE_NAME="$(echo "$PACKAGE_NAME" | xargs)"
if [ -z "$PACKAGE_NAME" ]; then
  echo "❌ Package name is required."
  exit 1
fi

read -r -p "Initial version [0.0.1]: " PACKAGE_VERSION
PACKAGE_VERSION="${PACKAGE_VERSION:-0.0.1}"
PACKAGE_VERSION="$(echo "$PACKAGE_VERSION" | xargs)"
if [ -z "$PACKAGE_VERSION" ]; then
  echo "❌ Version is required."
  exit 1
fi

if npm view "$PACKAGE_NAME" version >/dev/null 2>&1; then
  EXISTING_VERSION="$(npm view "$PACKAGE_NAME" version)"
  echo ""
  echo "❌ $PACKAGE_NAME already exists on npm (latest: $EXISTING_VERSION)."
  echo "   Trusted Publishing bootstrap is only for packages that are not on npm yet."
  exit 1
fi

echo ""
echo "Will publish:"
echo "  name:    $PACKAGE_NAME"
echo "  version: $PACKAGE_VERSION"
echo "  files:   package.json only"
echo ""
read -r -p "Publish to npm? [y/N] " CONFIRM_PUBLISH
if [[ ! "$CONFIRM_PUBLISH" =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 0
fi

WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/amplitude-npm-bootstrap.XXXXXX")"

cat > "$WORK_DIR/package.json" <<EOF
{
  "name": "$PACKAGE_NAME",
  "version": "$PACKAGE_VERSION",
  "description": "Bootstrap placeholder for Trusted Publishing setup. Do not use.",
  "private": false,
  "publishConfig": {
    "access": "public"
  }
}
EOF

echo ""
echo "Publishing from $WORK_DIR ..."
echo "npm will prompt for your 2FA one-time password when required."
echo ""

(
  cd "$WORK_DIR"
  # Run outside the monorepo so workspace settings do not affect publish.
  npm publish --access=public --tag alpha
)

echo ""
echo "✅ Published $PACKAGE_NAME@$PACKAGE_VERSION"
echo ""
echo "Next steps:"
echo "  1. Open https://www.npmjs.com/package/${PACKAGE_NAME}/access"
echo "  2. Configure Trusted Publishing (match @amplitude/analytics-browser settings)"
echo "  3. Publish real versions from GitHub Actions or the normal release workflow"
echo ""
