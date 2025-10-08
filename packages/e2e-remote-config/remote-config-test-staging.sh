# STAGING
API_KEY="52fbe5356dc7490756a9c26591f2bb37"
AMPLITUDE_VERSION="2.22.2"
SERVER_ZONE="STAGING"
SERVER_ZONE=$SERVER_ZONE API_KEY=$API_KEY AMPLITUDE_VERSION=$AMPLITUDE_VERSION npx playwright test --reporter=list packages/e2e-remote-config/test/e2e/fetch-remote-config.spec.ts
