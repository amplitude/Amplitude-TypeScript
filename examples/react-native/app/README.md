This is a new [**React Native**](https://reactnative.dev) project, bootstrapped using [`@react-native-community/cli`](https://github.com/react-native-community/cli).

# Getting Started

>**Note**: Make sure you have completed the [React Native - Environment Setup](https://reactnative.dev/docs/environment-setup) instructions till "Creating a new application" step, before proceeding.

## Step 1: Start the Metro Server

First, you will need to start **Metro**, the JavaScript _bundler_ that ships _with_ React Native.

To start Metro, run the following command from the _root_ of your React Native project:

```bash
# using npm
npm start

# OR using Yarn
yarn start
```

## Step 2: Start your Application

Let Metro Bundler run in its _own_ terminal. Open a _new_ terminal from the _root_ of your React Native project. Run the following command to start your _Android_ or _iOS_ app:

### For Android

```bash
# using npm
npm run android

# OR using Yarn
yarn android
```

### For iOS

```bash
# using npm
npm run ios

# OR using Yarn
yarn ios
```

If everything is set up _correctly_, you should see your new app running in your _Android Emulator_ or _iOS Simulator_ shortly provided you have set up your emulator/simulator correctly.

This is one way to run your app — you can also run it directly from within Android Studio and Xcode respectively.

# Amplitude
## Documentation
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
px react-native run-android 
```

### iOS
```
# cd into Amplitude-TypeScript/examples/react-native/app directory
px react-native run-ios
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

This error happens as the path is missing in the environment, refer to step 3 in [Android development environment](https://reactnative.dev/docs/environment-setup).

For macOS or Linux, make sure the `ANDROID_SDK_ROOT` is set up in shell:
```
export ANDROID_SDK_ROOT=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_SDK_ROOT/emulator
export PATH=$PATH:$ANDROID_SDK_ROOT/platform-tools
```