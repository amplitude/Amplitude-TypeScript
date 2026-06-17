# Session Replay React Native Example

Example app for `@amplitude/session-replay-react-native` with React Native New Architecture enabled (`newArchEnabled=true` on Android).

This app links the standalone package via `file:../` and exercises the internal Fabric `SRMaskView` component for on-device verification.

## Setup

Use **Yarn** (not npm/pnpm) because the example resolves the local package via `file:../`.

```bash
cd packages/session-replay-react-native/example
yarn install
```

### iOS

```bash
cd ios
RCT_NEW_ARCH_ENABLED=1 bundle exec pod install
cd ..
yarn ios
```

### Android

```bash
cd android
./gradlew assembleDebug
cd ..
yarn android
```

## Modifying the SDK

1. Make changes in `packages/session-replay-react-native/`
2. Press `r` in the Metro terminal to reload

## Troubleshooting

Run `yarn nuke` then reinstall if autolinking or pods get out of sync.
