This is a minimal [**React Native**](https://reactnative.dev) example that exercises the Amplitude React Native SDK from the local workspace. It is wired up to consume the SDK via `workspace:*`, so changes to the SDK source are picked up on the next Metro bundle.

- [Amplitude React Native SDK docs](https://www.docs.developers.amplitude.com/data/sdks/react-native-sdk/)
- [React Native environment setup](https://reactnative.dev/docs/environment-setup)

# Prerequisites

- **Node `>=18`** (CI uses Node 20) — check: `node -v`
- **[pnpm](https://pnpm.io/installation)** — check: `pnpm -v`
- **Xcode + iOS Simulator** (for iOS) — check: `xcodebuild -version && xcrun simctl list devices iOS available | head`
- **Ruby 3.2.x** and Bundler — used for CocoaPods. Matches CI. macOS system Ruby (2.6) hits an `activesupport` `Logger` load-order bug, and Ruby 4.x is too new for the pinned cocoapods (`< 1.15`). Install with `brew install ruby@3.2`. **brew's `ruby@3.2` is keg-only** — installing it does NOT put it on your PATH automatically. You must export PATH in every shell that runs `bundle`/`pod` commands, or add the export to `~/.zshrc` to make it persistent. See [Setup](#setup) step 3 for the exact commands. Check: `ruby -v` (expect `3.2.x`) and `bundle -v`.
- **UTF-8 locale** in the shell that runs `pod install`: `export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8`. Without it, cocoapods 1.14.3 crashes with `Unicode Normalization not appropriate for ASCII-8BIT`. Check: `echo "$LANG"` (expect a `*.UTF-8` value).
- **Android SDK** (for Android) — see [React Native environment setup](https://reactnative.dev/docs/environment-setup). Check: `echo "$ANDROID_SDK_ROOT"` and `adb --version`.

# Setup

Run these from the **repo root** unless noted. The app is a pnpm workspace package and no longer has its own lockfile.

```bash
# 1. Install workspace dependencies (from repo root)
pnpm install --frozen-lockfile

# 2. Build the SDK and its workspace deps so Metro/Xcode can resolve workspace:*
pnpm --filter @amplitude/analytics-react-native... build

# 3. Activate Ruby 3.2 and a UTF-8 locale for this shell.
#    brew's ruby@3.2 is keg-only, so this export is required in every shell
#    that runs bundle/pod commands. Add to ~/.zshrc to make it persistent.
export PATH="/opt/homebrew/opt/ruby@3.2/bin:$PATH"
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8

# Verify — both must succeed BEFORE running bundle install:
ruby -v       # expect 3.2.x  (if 2.6, the export above didn't take effect in this shell)
which ruby    # expect /opt/homebrew/opt/ruby@3.2/bin/ruby

# 4. Install CocoaPods for iOS
cd examples/react-native/app/ios
bundle install
bundle exec pod install
```

What step 4 does:

- `bundle install` reads [`Gemfile`](Gemfile) / `Gemfile.lock` and installs the project's Ruby gems (CocoaPods 1.14.x plus its transitive deps) into `vendor/bundle/`. This pins CocoaPods to a version the React Native 0.74 build is known to work with — the [`Gemfile`](Gemfile) constrains `cocoapods < 1.15` to avoid a 1.15-only RN build break.
- `bundle exec pod install` runs that pinned `pod` binary (not whatever `pod` is on your global PATH). It reads `ios/Podfile`, downloads the iOS native dependencies — React Native core, Hermes, plus auto-linked native modules like `@react-native-async-storage/async-storage` — and generates `ios/app.xcworkspace`, which is the workspace Xcode actually builds against.

# Configure

Replace `YOUR_API_KEY` in [`App.tsx`](App.tsx) with your Amplitude project's API key.

`init` is called at module scope rather than inside the component so any top-level SDK crash (e.g. a CJS circular-dep regression) surfaces on app launch.

# Run

From `examples/react-native/app`:

```bash
# Terminal 1: start Metro
pnpm start

# Terminal 2: launch the app
pnpm ios
# or
pnpm android
```

# Smoke test (Maestro)

A [Maestro](https://maestro.mobile.dev/) flow at [`.maestro/smoke.yaml`](.maestro/smoke.yaml) launches the app and asserts that "Test Amplitude App" is visible within 15s.

```bash
# Install Maestro
curl -fsSL "https://get.maestro.mobile.dev" | bash

# With a simulator booted and the app installed (e.g. via `pnpm ios`):
cd examples/react-native/app
maestro test .maestro/smoke.yaml
```

# New Architecture (Fabric/TurboModules)

CI builds and smoke-tests this app on both the legacy and the New Architecture
(see [CI](#ci)) to confirm the SDK's legacy-bridge native modules load through
the New Architecture interop layer without crashing the app. To build with the
New Architecture enabled locally:

```bash
# iOS — regenerate Pods with codegen, then build & run
cd examples/react-native/app/ios
RCT_NEW_ARCH_ENABLED=1 bundle exec pod install
cd .. && pnpm ios

# Android — set newArchEnabled=true in android/gradle.properties, then `pnpm android`
```

Switching architecture regenerates `Pods/`; if a later build fails on missing
Yoga headers, wipe `ios/Pods ios/build` and re-run `pod install` (see
[Troubleshooting](#troubleshooting)).

# Monorepo notes

Three pieces make the workspace setup work — keep them in sync if you change any of them:

- [`package.json`](package.json) declares `"@amplitude/analytics-react-native": "workspace:*"` so the example consumes local SDK source instead of the published version.
- [`.npmrc`](../../../.npmrc) at the repo root hoists `react-native`, `@babel/*`, `@react-native*`, and `metro*` packages. Metro cannot traverse pnpm's nested `.pnpm` store, so these need to be visible from a flat `node_modules`.
- [`metro.config.js`](metro.config.js) sets `watchFolders` and `nodeModulesPaths` to include the workspace root so Metro picks up SDK edits and resolves the hoisted deps.

The app is registered as a workspace package in [`pnpm-workspace.yaml`](../../../pnpm-workspace.yaml).

# CI

Pull requests run the iOS Maestro smoke test via [`.github/workflows/rn-smoke.yml`](../../../.github/workflows/rn-smoke.yml) on `macos-14` with an iPhone 15 simulator, once per architecture (old-arch and New Architecture) via a build matrix. If a local build fails, the workflow is the canonical reproduction — its step order matches this README.

# Troubleshooting

### Metro can't find `react-native` or `@babel/runtime`

Re-run `pnpm install` at the **repo root** so hoisted deps land in the root `node_modules`. An install run from inside the app directory is not equivalent.

### `ruby -v` still shows 2.6 after `brew install ruby@3.2`

brew's `ruby@3.2` is keg-only and is not added to your PATH automatically. Run the export, then re-verify:

```bash
export PATH="/opt/homebrew/opt/ruby@3.2/bin:$PATH"
which ruby   # must be /opt/homebrew/opt/ruby@3.2/bin/ruby
ruby -v      # must be 3.2.x
```

The export only applies to the shell where you ran it. To persist across shells, add it to `~/.zshrc`.

### `bundle` fails with `Could not find 'bundler' (4.0.9)`

You're running `/usr/bin/bundle` (system Ruby 2.6's bundler), which doesn't have the bundler version that `Gemfile.lock` requires. Same fix: put `ruby@3.2` on PATH first (see above), then `which bundle` should resolve to `/opt/homebrew/opt/ruby@3.2/bin/bundle`.

### `bundle exec pod install` fails with `uninitialized constant ActiveSupport::LoggerThreadSafeLevel::Logger`

You're on Ruby 2.6 (macOS system Ruby). `activesupport` 6.1.7.x has a `Logger` constant load-order bug on Ruby 2.6 that's fixed on 2.7+. Switch to Ruby 3.2 as above, then remove `vendor/bundle` and `Gemfile.lock` and re-run `bundle install`.

### `bundle exec pod install` fails with `cannot load such file -- kconv`

You're on Ruby 3.4+/4.0+. `kconv` was removed from the default gems and cocoapods 1.14.3 still depends on it. Prefer Ruby 3.2 (see above), or keep the `nkf` gem in the `Gemfile` (it provides `kconv`).

### `bundle exec pod install` fails with `Unicode Normalization not appropriate for ASCII-8BIT`

The shell isn't using a UTF-8 locale. `export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8` and retry. CocoaPods itself prints this hint in its output.

### iOS build fails with `'yoga/<sub>/<name>.h' file not found` (also `React-rendererdebug` / `React-logger` `ScanDependencies` failures)

The first `pod install` on a fresh clone can leave Yoga's private headers incomplete — usually because the repo's checked-in `Podfile.lock` was generated by a newer cocoapods (`1.16.2`) than the one the `Gemfile` pins (`< 1.15`). The install prints a warning: *"The version of CocoaPods used to generate the lockfile (1.16.2) is higher than the version of the current executable (1.14.3). Incompatibility issues may arise."* In that state, the build then fails on missing headers like `yoga/numeric/Comparison.h`, `yoga/algorithm/PixelGrid.h`, `yoga/debug/AssertFatal.h`. Wipe and reinstall:

```bash
cd examples/react-native/app/ios
trash Pods Podfile.lock   # or rm -rf
bundle exec pod install   # regenerates a 1.14.3 lockfile and full Yoga headers
```

Then re-run `pnpm ios` from `examples/react-native/app`.

### Could not determine the dependencies of task ':app:compileDebugJavaWithJavac'

```
error Failed to install the app. Make sure you have the Android development environment set up: https://reactnative.dev/docs/environment-setup.
Error: Command failed: ./gradlew app:installDebug -PreactNativeDevServerPort=8081

FAILURE: Build failed with an exception.

* What went wrong:
Could not determine the dependencies of task ':app:compileDebugJavaWithJavac'.
> SDK location not found. Define location with an ANDROID_SDK_ROOT environment variable or by setting the sdk.dir path in your project's local properties file at ...
```

The path to the Android SDK is missing from the environment — see step 3 in the [Android development environment](https://reactnative.dev/docs/environment-setup) guide.

For macOS or Linux, set `ANDROID_SDK_ROOT` in your shell:

```bash
export ANDROID_SDK_ROOT=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_SDK_ROOT/emulator
export PATH=$PATH:$ANDROID_SDK_ROOT/platform-tools
```
