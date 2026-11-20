#!/bin/sh
set -eu

: "${REMOTE_CONFIG_STAGING_API_KEY:?Set REMOTE_CONFIG_STAGING_API_KEY before running staging tests}"

# STAGING
API_KEY="$REMOTE_CONFIG_STAGING_API_KEY"
AMPLITUDE_VERSION="2.22.2"
SERVER_ZONE="STAGING"
SERVER_ZONE="$SERVER_ZONE" API_KEY="$API_KEY" AMPLITUDE_VERSION="$AMPLITUDE_VERSION" npx playwright test --reporter=list packages/e2e-remote-config/test/e2e/fetch-remote-config.spec.ts
