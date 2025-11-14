#!/bin/bash

# Run setup scripts
sh ./scripts/dev/setup-local-domain.sh
if [ $? -ne 0 ]; then
    exit 1
fi

sh ./scripts/dev/generate-signed-cert.sh
if [ $? -ne 0 ]; then
    exit 1
fi

# Show completion message
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Setup complete! Ready for HTTPS development."
echo ""
echo "🚀 Starting dev server at https://local.website.com:5173"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

