# API_KEY empty
API_KEY="657954c4c37e22e8dc2af0413ac01e2b"
SERVER_ZONE="US"
API_KEY=$API_KEY AMPLITUDE_VERSION=$AMPLITUDE_VERSION npx playwright test --reporter=list packages/e2e-remote-config/test/e2e/fetch-remote-config.spec.ts

# 2.11.0 -- first mionor version to support remote config for autocapture
AMPLITUDE_VERSION="2.11.13"
API_KEY=$API_KEY AMPLITUDE_VERSION=$AMPLITUDE_VERSION npx playwright test --reporter=list packages/e2e-remote-config/test/e2e/fetch-remote-config.spec.ts

# 2.13.3 -- first minor version to set remote config fetch default=true
AMPLITUDE_VERSION="2.13.3"
API_KEY=$API_KEY AMPLITUDE_VERSION=$AMPLITUDE_VERSION npx playwright test --reporter=list packages/e2e-remote-config/test/e2e/fetch-remote-config.spec.ts

# 2.17.12 -- first minor version to use the new Remote Config client
AMPLITUDE_VERSION="2.22.2"
API_KEY=$API_KEY AMPLITUDE_VERSION=$AMPLITUDE_VERSION npx playwright test --reporter=list packages/e2e-remote-config/test/e2e/fetch-remote-config.spec.ts

# API_KEY nested
API_KEY="77de0b7de6157d5e7ca409c81778f28e"
AMPLITUDE_VERSION="2.11.13"
API_KEY=$API_KEY AMPLITUDE_VERSION=$AMPLITUDE_VERSION npx playwright test --reporter=list packages/e2e-remote-config/test/e2e/fetch-remote-config.spec.ts

AMPLITUDE_VERSION="2.13.3"
API_KEY=$API_KEY AMPLITUDE_VERSION=$AMPLITUDE_VERSION npx playwright test --reporter=list packages/e2e-remote-config/test/e2e/fetch-remote-config.spec.ts

AMPLITUDE_VERSION="2.22.2"
API_KEY=$API_KEY AMPLITUDE_VERSION=$AMPLITUDE_VERSION npx playwright test --reporter=list packages/e2e-remote-config/test/e2e/fetch-remote-config.spec.ts

# API_KEY default
API_KEY="aafc4dd16b5bf88b1cf21693d97665d3"
AMPLITUDE_VERSION="2.11.13"
API_KEY=$API_KEY AMPLITUDE_VERSION=$AMPLITUDE_VERSION npx playwright test --reporter=list packages/e2e-remote-config/test/e2e/fetch-remote-config.spec.ts

AMPLITUDE_VERSION="2.13.3"
API_KEY=$API_KEY AMPLITUDE_VERSION=$AMPLITUDE_VERSION npx playwright test --reporter=list packages/e2e-remote-config/test/e2e/fetch-remote-config.spec.ts

AMPLITUDE_VERSION="2.22.2"
API_KEY=$API_KEY AMPLITUDE_VERSION=$AMPLITUDE_VERSION npx playwright test --reporter=list packages/e2e-remote-config/test/e2e/fetch-remote-config.spec.ts