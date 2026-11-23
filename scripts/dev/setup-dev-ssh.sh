#!/bin/bash

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd) || exit 1

sh "$script_dir/setup-local-domain.sh" || exit 1
sh "$script_dir/generate-signed-cert.sh" || exit 1

# Show completion message
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Setup complete! Ready for HTTPS development."
echo ""
echo "🚀 Starting dev server at https://local.website.com:5173"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

