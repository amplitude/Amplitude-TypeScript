#!/usr/bin/env node
/**
 * Build + install examples/react-native/app for Android (if needed), then run
 * react-native-harness with HARNESS_APP_PATH so the APK is (re)installed.
 *
 * Architecture (NEW_ARCH):
 *   NEW_ARCH=0  → legacy bridge (default). Cached APK: harness/app-debug-old-arch.apk
 *   NEW_ARCH=1  → New Architecture. Cached APK: harness/app-debug-new-arch.apk
 *
 * Gradle is invoked with `-PnewArchEnabled=true|false` (overrides gradle.properties).
 * Set FORCE_REBUILD=1 to rebuild even if a cached APK exists.
 * Set BUILD_ONLY=1 to build/cache the APK and exit (no harness run) — useful in
 * CI so Gradle can finish before the Android emulator is booted.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  androidRoot,
  ensureDir,
  isTruthyEnv,
  packageRoot,
  resolveNewArch,
  run,
} from './harness-common.mjs';

const arch = resolveNewArch();
const forceRebuild = isTruthyEnv('FORCE_REBUILD');
const buildOnly = isTruthyEnv('BUILD_ONLY');

const gradleDebugApk = path.join(
  androidRoot,
  'app/build/outputs/apk/debug/app-debug.apk',
);
const harnessApkDir = path.join(androidRoot, 'app/build/harness');
const cachedApk = path.join(harnessApkDir, `app-debug-${arch.label}.apk`);

const buildApk = () => {
  console.log(
    `Building Android debug APK (${arch.label}, -PnewArchEnabled=${arch.gradleFlag})...`,
  );
  // CI emulators are x86_64; building all ABIs inflates memory/time for no gain.
  const architectures =
    process.env.REACT_NATIVE_ARCHITECTURES ||
    (process.env.CI ? 'x86_64' : undefined);

  run(
    './gradlew',
    [
      ':app:assembleDebug',
      `-PnewArchEnabled=${arch.gradleFlag}`,
      ...(architectures
        ? [`-PreactNativeArchitectures=${architectures}`]
        : []),
      '--console=plain',
    ],
    {
      cwd: androidRoot,
      env: {
        ...process.env,
        ORG_GRADLE_PROJECT_newArchEnabled: arch.gradleFlag,
      },
    },
  );

  if (!fs.existsSync(gradleDebugApk)) {
    console.error(
      `Build finished but could not find APK. Expected: ${gradleDebugApk}`,
    );
    process.exit(1);
  }

  ensureDir(harnessApkDir);
  fs.copyFileSync(gradleDebugApk, cachedApk);
  console.log(`Cached APK for ${arch.label}: ${cachedApk}`);
};

if (!fs.existsSync(cachedApk) || forceRebuild) {
  if (forceRebuild && fs.existsSync(cachedApk)) {
    console.log(`FORCE_REBUILD=1: rebuilding ${arch.label} Android APK...`);
  }
  buildApk();
} else {
  console.log(`Using existing APK (${arch.label}): ${cachedApk}`);
}

if (buildOnly) {
  console.log('BUILD_ONLY=1: skipping harness run.');
  process.exit(0);
}

const harnessArgs = process.argv.slice(2);
console.log(`Running harness on Android (${arch.label})...`);
// When HARNESS_APP_PATH is set, the Android harness uninstalls + reinstalls.
run(
  'pnpm',
  ['exec', 'react-native-harness', '--harnessRunner', 'android', ...harnessArgs],
  {
    cwd: packageRoot,
    env: {
      ...process.env,
      HARNESS_APP_PATH: cachedApk,
      HARNESS_PLATFORM: 'android',
      NEW_ARCH: arch.rctFlag,
    },
  },
);
