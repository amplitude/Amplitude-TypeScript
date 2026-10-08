#!/usr/bin/env bash
set -euo pipefail

package_name='@amplitude/plugin-custom-enrichment-browser'
package_dir='packages/plugin-custom-enrichment-browser'
version=$(node -p "require('./$package_dir/package.json').version")

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "version=$version" >> "$GITHUB_OUTPUT"
fi

# A recovery run can resume after npm approval without staging the same version again.
published_versions=$(npm view "$package_name" versions --json --prefer-online)
if node -e 'const versions = JSON.parse(process.argv[1]); process.exit([versions].flat().includes(process.argv[2]) ? 0 : 1)' "$published_versions" "$version"; then
  echo "$package_name@$version is already live; no npm approval needed."
  if [ -n "${GITHUB_OUTPUT:-}" ]; then echo 'required=false' >> "$GITHUB_OUTPUT"; fi
  exit 0
fi

if [ -n "${GITHUB_OUTPUT:-}" ]; then echo 'required=true' >> "$GITHUB_OUTPUT"; fi
package_dir_tmp=$(mktemp -d)
trap 'rm -rf "$package_dir_tmp"' EXIT

# pnpm pack resolves workspace:* dependencies to the versions in this release.
pnpm --dir "$package_dir" pack --pack-destination "$package_dir_tmp"
tarball=$(find "$package_dir_tmp" -maxdepth 1 -name '*.tgz' -print -quit)
if [ -z "$tarball" ]; then
  echo 'Plugin tarball was not created.' >&2
  exit 1
fi

echo "Staging $package_name@$version from $tarball"
stage_options=(--access public --provenance)
if [ -n "${PREID:-}" ]; then stage_options+=(--tag "$PREID"); fi
npm stage publish "$tarball" "${stage_options[@]}"
