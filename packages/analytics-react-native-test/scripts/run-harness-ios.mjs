#!/usr/bin/env node
/**
 * Build examples/react-native/app for the iOS simulator (if needed), then run
 * react-native-harness with HARNESS_APP_PATH set so the binary can be installed.
 *
 * Architecture (NEW_ARCH):
 *   NEW_ARCH=0  → legacy bridge (default). Binary under ios/build-old-arch/
 *   NEW_ARCH=1  → New Architecture. Binary under ios/build-new-arch/
 *
 * Pods are regenerated when the architecture marker disagrees with NEW_ARCH
 * (RCT_NEW_ARCH_ENABLED is baked in at `pod install` time). Set FORCE_PODS=1
 * to wipe Pods first. Set FORCE_REBUILD=1 to rebuild even if the .app exists.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  IOS_BUNDLE_ID,
  iosRoot,
  isTruthyEnv,
  packageRoot,
  readMarker,
  resolveNewArch,
  run,
  tryRun,
  writeMarker,
} from './harness-common.mjs';

const arch = resolveNewArch();
const forceRebuild = isTruthyEnv('FORCE_REBUILD');
const forcePods = isTruthyEnv('FORCE_PODS');

const derivedDataPath = path.join(iosRoot, `build-${arch.label}`);
const appBundle = path.join(
  derivedDataPath,
  'Build/Products/Debug-iphonesimulator/app.app',
);
const podsXcconfig = path.join(
  iosRoot,
  'Pods/Target Support Files/Pods-app/Pods-app.debug.xcconfig',
);
const podsArchMarker = path.join(iosRoot, '.harness-pods-arch');

const podEnv = {
  ...process.env,
  LANG: process.env.LANG || 'en_US.UTF-8',
  LC_ALL: process.env.LC_ALL || 'en_US.UTF-8',
  RCT_NEW_ARCH_ENABLED: arch.rctFlag,
};

const ensurePods = () => {
  const current = readMarker(podsArchMarker);
  const podsPresent = fs.existsSync(podsXcconfig);
  const needsInstall = !podsPresent || current !== arch.label || forcePods;

  if (!needsInstall) {
    return;
  }

  if (forcePods && fs.existsSync(path.join(iosRoot, 'Pods'))) {
    console.log('FORCE_PODS=1: removing ios/Pods...');
    fs.rmSync(path.join(iosRoot, 'Pods'), { recursive: true, force: true });
  }

  console.log(
    `Installing CocoaPods for examples/react-native/app (RCT_NEW_ARCH_ENABLED=${arch.rctFlag})...`,
  );
  // CocoaPods + pnpm monorepos intermittently raise
  // `ArgumentError - pathname contains null byte` in Pathname#realdirpath
  // (cocoapods/cocoapods#12866). Match rn-smoke.yml: bundle-exec + retry.
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (
      tryRun('bundle', ['exec', 'pod', 'install'], {
        cwd: iosRoot,
        env: podEnv,
      })
    ) {
      writeMarker(podsArchMarker, arch.label);
      return;
    }
    if (attempt < maxAttempts) {
      console.warn(
        `pod install attempt ${attempt} failed, retrying in 5s...`,
      );
      tryRun('sleep', ['5'], { stdio: 'ignore' });
    }
  }
  console.error(`pod install failed ${maxAttempts} times`);
  process.exit(1);
};

const buildApp = () => {
  ensurePods();
  console.log(
    `Building iOS simulator app (${arch.label}) → ${appBundle}...`,
  );
  run(
    'xcodebuild',
    [
      '-workspace',
      'app.xcworkspace',
      '-scheme',
      'app',
      '-configuration',
      'Debug',
      '-sdk',
      'iphonesimulator',
      '-destination',
      'generic/platform=iOS Simulator',
      '-derivedDataPath',
      derivedDataPath,
    ],
    {
      cwd: iosRoot,
      env: {
        ...process.env,
        RCT_NO_LAUNCH_PACKAGER: '1',
        RCT_NEW_ARCH_ENABLED: arch.rctFlag,
      },
    },
  );

  if (!fs.existsSync(appBundle)) {
    console.error(
      `Build finished but could not find app.app. Expected: ${appBundle}`,
    );
    process.exit(1);
  }
};

if (!fs.existsSync(appBundle) || forceRebuild) {
  if (forceRebuild && fs.existsSync(appBundle)) {
    console.log(`FORCE_REBUILD=1: rebuilding ${arch.label} iOS app...`);
  }
  buildApp();
} else {
  console.log(`Using existing app bundle (${arch.label}): ${appBundle}`);
}

// Harness only installs from HARNESS_APP_PATH when the app is missing — uninstall
// so we always get the binary that matches NEW_ARCH.
console.log(`Uninstalling ${IOS_BUNDLE_ID} from booted simulator (if present)...`);
tryRun('xcrun', ['simctl', 'uninstall', 'booted', IOS_BUNDLE_ID], {
  stdio: 'ignore',
});

const harnessArgs = process.argv.slice(2);
console.log(`Running harness on iOS (${arch.label})...`);
run(
  'pnpm',
  ['exec', 'react-native-harness', '--harnessRunner', 'ios', ...harnessArgs],
  {
    cwd: packageRoot,
    env: {
      ...process.env,
      HARNESS_APP_PATH: appBundle,
      HARNESS_PLATFORM: 'ios',
      NEW_ARCH: arch.rctFlag,
    },
  },
);
