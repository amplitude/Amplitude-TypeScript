#!/bin/bash

CERT_DIR=~/certs/local-website
CERT_FILE=$CERT_DIR/cert.pem
KEY_FILE=$CERT_DIR/key.pem

echo ""
echo "Step 2: Checking SSL certificates..."

# Check if certificates already exist
if [ -f "$CERT_FILE" ] && [ -f "$KEY_FILE" ]; then
    echo "✓ SSL certificates already exist"
    exit 0
fi

echo ""
echo "🔐 Generating SSL certificates for local.website.com..."
echo "   (This may take a moment)"
echo ""

mkdir -p "$CERT_DIR"
cd "$CERT_DIR"

openssl req -x509 -out cert.pem -keyout key.pem \
  -newkey rsa:2048 -nodes -sha256 \
  -subj "/CN=local.website.com" \
  -addext "subjectAltName=DNS:local.website.com" \
  -days 365 2>/dev/null

if [ $? -eq 0 ]; then
    echo ""
    echo "✓ SSL certificates generated successfully"
    echo ""
    echo "📍 Certificates location: $CERT_DIR"
    echo ""
    echo "⚠️  Note: Your browser will show a security warning because this is a"
    echo "   self-signed certificate. Click 'Advanced' and proceed anyway, or"
    echo "   trust the certificate in your system keychain."
else
    echo "✗ Failed to generate SSL certificates"
    exit 1
fi