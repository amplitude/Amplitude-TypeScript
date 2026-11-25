#!/bin/sh
set -eu

# Each project exercises a different remote-config response shape.
: "${REMOTE_CONFIG_EMPTY_API_KEY:?Set REMOTE_CONFIG_EMPTY_API_KEY before running remote-config tests}"
: "${REMOTE_CONFIG_NESTED_API_KEY:?Set REMOTE_CONFIG_NESTED_API_KEY before running remote-config tests}"
: "${REMOTE_CONFIG_DEFAULT_API_KEY:?Set REMOTE_CONFIG_DEFAULT_API_KEY before running remote-config tests}"

# API_KEY empty
API_KEY="${REMOTE_CONFIG_EMPTY_API_KEY}"
export SERVER_ZONE="US"
API_KEY="$API_KEY" AMPLITUDE_VERSION="${AMPLITUDE_VERSION:-}" npx playwright test --reporter=list packages/e2e-remote-config/test/e2e/fetch-remote-config.spec.ts

# 2.11.0 -- first mionor version to support remote config for autocapture
AMPLITUDE_VERSION="2.11.13"
API_KEY="$API_KEY" AMPLITUDE_VERSION="${AMPLITUDE_VERSION:-}" npx playwright test --reporter=list packages/e2e-remote-config/test/e2e/fetch-remote-config.spec.ts

# 2.13.3 -- first minor version to set remote config fetch default=true
AMPLITUDE_VERSION="2.13.3"
API_KEY="$API_KEY" AMPLITUDE_VERSION="${AMPLITUDE_VERSION:-}" npx playwright test --reporter=list packages/e2e-remote-config/test/e2e/fetch-remote-config.spec.ts

# 2.17.12 -- first minor version to use the new Remote Config client
AMPLITUDE_VERSION="2.22.2"
API_KEY="$API_KEY" AMPLITUDE_VERSION="${AMPLITUDE_VERSION:-}" npx playwright test --reporter=list packages/e2e-remote-config/test/e2e/fetch-remote-config.spec.ts

# API_KEY nested
API_KEY="${REMOTE_CONFIG_NESTED_API_KEY}"
AMPLITUDE_VERSION="2.11.13"
API_KEY="$API_KEY" AMPLITUDE_VERSION="${AMPLITUDE_VERSION:-}" npx playwright test --reporter=list packages/e2e-remote-config/test/e2e/fetch-remote-config.spec.ts

AMPLITUDE_VERSION="2.13.3"
API_KEY="$API_KEY" AMPLITUDE_VERSION="${AMPLITUDE_VERSION:-}" npx playwright test --reporter=list packages/e2e-remote-config/test/e2e/fetch-remote-config.spec.ts

AMPLITUDE_VERSION="2.22.2"
API_KEY="$API_KEY" AMPLITUDE_VERSION="${AMPLITUDE_VERSION:-}" npx playwright test --reporter=list packages/e2e-remote-config/test/e2e/fetch-remote-config.spec.ts

# API_KEY default
API_KEY="${REMOTE_CONFIG_DEFAULT_API_KEY}"
AMPLITUDE_VERSION="2.11.13"
API_KEY="$API_KEY" AMPLITUDE_VERSION="${AMPLITUDE_VERSION:-}" npx playwright test --reporter=list packages/e2e-remote-config/test/e2e/fetch-remote-config.spec.ts

AMPLITUDE_VERSION="2.13.3"
API_KEY="$API_KEY" AMPLITUDE_VERSION="${AMPLITUDE_VERSION:-}" npx playwright test --reporter=list packages/e2e-remote-config/test/e2e/fetch-remote-config.spec.ts

AMPLITUDE_VERSION="2.22.2"
API_KEY="$API_KEY" AMPLITUDE_VERSION="${AMPLITUDE_VERSION:-}" npx playwright test --reporter=list packages/e2e-remote-config/test/e2e/fetch-remote-config.spec.ts
