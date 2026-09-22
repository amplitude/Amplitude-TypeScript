# React-Native Example App (Expo)
## Documentation
- [React Native SDK](https://www.docs.developers.amplitude.com/data/sdks/react-native-sdk/)

## Setup
```
# cd into Amplitude-TypeScript/examples/react-native/expo-app directory
pnpm install
```

## Run
### Prerequisite
- [Setting up the development environment](https://reactnative.dev/docs/environment-setup)
- [Install expo](https://docs.expo.dev/get-started/installation/)
- Update the `API_KEY` in `App.tsx` file.

`@react-native-async-storage/async-storage` is a direct dependency and is
autolinked as `RNCAsyncStorage` (see [`react-native.config.js`](react-native.config.js)).
After changing native deps, reinstall pods (`cd ios && pod install`) and rebuild.

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
