#!/bin/bash

# Script to setup local.website.com domain in /etc/hosts
DOMAIN="local.website.com"
HOSTS_FILE="/etc/hosts"
HOSTS_ENTRY="127.0.0.1 $DOMAIN"

echo ""
echo "🔧 Setting up local HTTPS development environment..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Step 1: Checking if $DOMAIN is configured..."

# Check if the domain already exists in hosts file
if grep -q "$DOMAIN" "$HOSTS_FILE"; then
    echo "✓ $DOMAIN is already configured"
    exit 0
else
    echo "✗ $DOMAIN not found in $HOSTS_FILE"
    echo ""
    echo "📝 Adding $DOMAIN to $HOSTS_FILE..."
    echo "   (This requires sudo - you may be prompted for your password)"
    echo ""
    
    # Add the entry to hosts file
    echo "$HOSTS_ENTRY" | sudo tee -a "$HOSTS_FILE" > /dev/null
    
    if [ $? -eq 0 ]; then
        echo "✓ Successfully added $DOMAIN to $HOSTS_FILE"
    else
        echo "✗ Failed to add $DOMAIN to $HOSTS_FILE"
        exit 1
    fi
fi

