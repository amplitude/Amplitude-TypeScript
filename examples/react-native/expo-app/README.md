# React-Native Example App (Expo)
## Documentation
- [React Native SDK](https://www.docs.developers.amplitude.com/data/sdks/react-native-sdk/)

## Setup
This example is Expo SDK 52 (React Native 0.76). New Architecture is off so the existing native bridge modules link.

```
# cd into Amplitude-TypeScript/examples/react-native/expo-app directory
pnpm install
```

## Run
### Prerequisite
- [Setting up the development environment](https://reactnative.dev/docs/environment-setup)
- [Install expo](https://docs.expo.dev/get-started/installation/)
- Export `AMPLITUDE_API_KEY` before starting Metro (the Babel config inlines it).

`@react-native-async-storage/async-storage` is a direct dependency and is
autolinked as `RNCAsyncStorage` (see [`react-native.config.js`](react-native.config.js)).
After changing native deps, reinstall pods (`cd ios && pod install`) and rebuild. CocoaPods needs a UTF-8 locale: `export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8`.

## Dead click manual test

The app installs the local Session Replay plugin with a 100% sample rate and remote configuration disabled, and enables frustration interactions. Use an iOS or Android development build; Expo Go and Web cannot run native Replay detection.

The dead-click detector and native UI-change signal bridge are delivered in a follow-up SDK PR stacked on this examples PR. Until that implementation is applied, this screen exercises the controls and Replay lifecycle but will not produce dead-click events. The expected results below apply with that SDK implementation present.

After installing dependencies, reinstall iOS pods and rebuild the native app so it includes Replay. Restart Metro after changing `AMPLITUDE_API_KEY`.

Open **Home → Dead Click Test**. Wait until Replay is started and the screen has settled. Leave at least four seconds between tests; scroll into position before tapping and avoid scrolling or other UI activity during the detection window.

| Control | Expected result |
| --- | --- |
| No response | One `[Amplitude] Dead Click` after three seconds. |
| Update immediately | UI update count increases; no dead click. |
| Update after 1 second | UI update count increases within the timeout; no dead click. |
| Update after 4 seconds | Dead click after three seconds, then the UI update count increases. |
| Stop Replay, then No response | No dead click. Use Start Replay to resume detection. |
| No response, then Stop Replay within three seconds | No event for the pending press. |

The screen displays the last ten dead clicks from its four test controls with their properties, and prints each to Metro with the `[Dead Click Test]` prefix. There is deliberately no countdown or pressed-state animation: that would count as UI activity. Clear results between scenarios if helpful, then wait for the screen to settle again.

Additional lifecycle and dependency checks will accompany the follow-up SDK implementation.

### Android
```
# cd into Amplitude-TypeScript/examples/react-native/expo-app directory
pnpm run android
```

### iOS
```
# cd into Amplitude-TypeScript/examples/react-native/expo-app directory
pnpm run ios
```

### Web
```
# cd into Amplitude-TypeScript/examples/react-native/expo-app directory
pnpm run web
```
