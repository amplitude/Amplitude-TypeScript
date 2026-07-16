<p align="center">
  <a href="https://amplitude.com" target="_blank" align="center">
    <img src="https://static.amplitude.com/lightning/46c85bfd91905de8047f1ee65c7c93d6fa9ee6ea/static/media/amplitude-logo-with-text.4fb9e463.svg" width="280">
  </a>
  <br />
</p>

# `@amplitude/analytics-react-native-test`

> On-device React Native Harness tests for `@amplitude/analytics-react-native`.

Uses Metro ≥ 0.81 (via React Native 0.76) so `react-native-harness` can resolve `metro/private/*`.

## Prerequisites

Harness needs a debug build of `examples/react-native/app`. The run scripts build
and (re)install that host app as needed:

- **iOS** — `pod install` (with `RCT_NEW_ARCH_ENABLED`) + `xcodebuild`, then sets
  `HARNESS_APP_PATH` to the simulator `.app`.
- **Android** — `./gradlew :app:assembleDebug -PnewArchEnabled=…`, then sets
  `HARNESS_APP_PATH` to the APK (Harness uninstalls + reinstalls when this is set).

> `examples/react-native/expo-app` (Expo 48 / RN 0.71) currently cannot install
> CocoaPods on modern Xcode due to a broken boost download/checksum.

## Run

```bash
# Legacy bridge (default, NEW_ARCH=0)
pnpm --filter @amplitude/analytics-react-native-test test:harness:ios
pnpm --filter @amplitude/analytics-react-native-test test:harness:android

# Explicit architecture aliases
pnpm --filter @amplitude/analytics-react-native-test test:harness:ios:old-arch
pnpm --filter @amplitude/analytics-react-native-test test:harness:ios:new-arch
pnpm --filter @amplitude/analytics-react-native-test test:harness:android:old-arch
pnpm --filter @amplitude/analytics-react-native-test test:harness:android:new-arch
```

Or set the env var directly:

```bash
NEW_ARCH=0 pnpm test:harness:ios
NEW_ARCH=1 pnpm test:harness:android
```

Accepted `NEW_ARCH` values: `0` / `false` / `off` (legacy) and `1` / `true` / `on` (New Architecture).

### Cached binaries

Old- and new-arch binaries are kept separate so you can switch without a full rebuild every time:

| Platform | Path |
|---|---|
| iOS old-arch | `examples/react-native/app/ios/build-old-arch/.../app.app` |
| iOS new-arch | `examples/react-native/app/ios/build-new-arch/.../app.app` |
| Android old-arch | `examples/react-native/app/android/app/build/harness/app-debug-old-arch.apk` |
| Android new-arch | `examples/react-native/app/android/app/build/harness/app-debug-new-arch.apk` |

### Force rebuild

```bash
FORCE_REBUILD=1 pnpm test:harness:ios:new-arch
FORCE_REBUILD=1 pnpm test:harness:android:old-arch

# iOS only: wipe Pods before regenerating for the selected architecture
FORCE_PODS=1 NEW_ARCH=1 pnpm test:harness:ios
```
