# Session Replay React Native Example

Example app for `@amplitude/session-replay-react-native` with React Native New Architecture enabled (`newArchEnabled=true` on Android).

This app links the standalone package via `file:../` and exercises the internal Fabric `SRMaskView` component for on-device verification.

## Setup

Use **Yarn** (not npm/pnpm) because the example resolves the local package via `file:../`.

The monorepo root pins **pnpm** via Corepack. Prefix Yarn commands with `COREPACK_ENABLE_STRICT=0` so Yarn is allowed in this directory:

```bash
cd packages/session-replay-react-native/example
COREPACK_ENABLE_STRICT=0 yarn install
```

### iOS

```bash
cd ios
RCT_NEW_ARCH_ENABLED=1 bundle exec pod install
cd ..
COREPACK_ENABLE_STRICT=0 yarn ios
```

### Android

```bash
cd android
./gradlew assembleDebug
cd ..
COREPACK_ENABLE_STRICT=0 yarn android
```

### Metro

```bash
COREPACK_ENABLE_STRICT=0 yarn start --reset-cache
```

## Modifying the SDK

1. Make changes in `packages/session-replay-react-native/`
2. Press `r` in the Metro terminal to reload

After native changes, refresh the linked package copy:

```bash
rm -rf node_modules/@amplitude/session-replay-react-native
COREPACK_ENABLE_STRICT=0 yarn install
```

## Troubleshooting

```bash
COREPACK_ENABLE_STRICT=0 yarn nuke
```

Use this if autolinking or pods get out of sync (`yarn nuke` runs clean + install with the Corepack prefix).
