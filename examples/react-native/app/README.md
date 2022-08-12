# React-Native Example App
## Docs
- [React Native SDK](https://www.docs.developers.amplitude.com/data/sdks/react-native-sdk/)

## Setup
```
# cd into Amplitude-TypeScript/examples/react-native/app directory
npm install
cd ios
pod install
```

## Run
### Prerequisite
- [Setting up the development environment](https://reactnative.dev/docs/environment-setup)
- Update the `API_KEY` in `App.tsx` file.

### Android
```
# cd into Amplitude-TypeScript/examples/react-native/app directory
npm run android
```

### iOS
```
# cd into Amplitude-TypeScript/examples/react-native/app directory
npm run ios
```

### Issues
#### Could not determine the dependencies of task ':app:compileDebugJavaWithJavac'
```
error Failed to install the app. Make sure you have the Android development environment set up: https://reactnative.dev/docs/environment-setup.
Error: Command failed: ./gradlew app:installDebug -PreactNativeDevServerPort=8081

FAILURE: Build failed with an exception.

* What went wrong:
Could not determine the dependencies of task ':app:compileDebugJavaWithJavac'.
> SDK location not found. Define location with an ANDROID_SDK_ROOT environment variable or by setting the sdk.dir path in your project's local properties file at ...
```
Make sure the `ANDROID_SDK_ROOT` is setup in shell:
```
export ANDROID_SDK_ROOT=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_SDK_ROOT/emulator
export PATH=$PATH:$ANDROID_SDK_ROOT/platform-tools
```
