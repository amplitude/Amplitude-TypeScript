#!/usr/bin/env bash
set -euo pipefail

version=${1:?Expected the exact custom enrichment plugin version}
package_name='@amplitude/plugin-custom-enrichment-browser'
published_version=$(npm view "$package_name@$version" version --json --prefer-online)
published_version=${published_version//\"/}

if [ "$published_version" != "$version" ]; then
  echo "$package_name@$version is not live on npm. Approve the staged version on npm first." >&2
  exit 1
fi

echo "Verified $package_name@$version is live on npm."
