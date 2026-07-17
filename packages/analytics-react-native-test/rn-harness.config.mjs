import {
  androidPlatform,
  androidEmulator,
  getRunTargets as getAndroidRunTargets,
} from '@react-native-harness/platform-android';
import { execFileSync } from 'node:child_process';

/**
 * Host native binary: examples/react-native/app (built + installed via HARNESS_APP_PATH).
 * Metro entryPoint must stay inside this package — paths outside projectRoot break Metro URL resolution.
 *
 * Note: examples/react-native/expo-app (Expo 48 / RN 0.71) currently fails CocoaPods
 * install on modern Xcode (broken boost tarball checksum/download).
 *
 * Platform selection:
 *   HARNESS_PLATFORM=ios|android  → only register that runner (set by run-harness-*.mjs)
 *   unset                         → auto-discover available runners
 *
 * Never probe Apple APIs off macOS: `@react-native-harness/tools` spawn (nano-spawn)
 * surfaces an unhandled rejection on `xcrun` ENOENT even when the promise is caught,
 * which crashes Node on Linux Android CI.
 */

/** @returns {'ios' | 'android' | null} */
const requestedPlatform = () => {
  const raw = (process.env.HARNESS_PLATFORM ?? '').trim().toLowerCase();
  if (raw === 'ios' || raw === 'android') {
    return raw;
  }
  return null;
};

const shouldRegisterIos = () => {
  const requested = requestedPlatform();
  if (requested === 'android') {
    return false;
  }
  if (process.platform !== 'darwin') {
    return false;
  }
  return true;
};

const shouldRegisterAndroid = () => {
  const requested = requestedPlatform();
  return requested !== 'ios';
};

const pickAvailableIosSimulator = async () => {
  // Dynamic import so Linux never loads platform-apple / xcrun helpers.
  const {
    getRunTargets: getAppleRunTargets,
  } = await import('@react-native-harness/platform-apple');

  const targets = (await getAppleRunTargets()).filter(
    (target) => target.platform === 'ios' && target.type === 'emulator',
  );

  if (targets.length === 0) {
    throw new Error(
      'No available iOS Simulator found. Install one via Xcode > Settings > Platforms.',
    );
  }

  // Prefer a currently booted simulator when possible.
  let bootedNames = new Set();
  try {
    const raw = execFileSync(
      'xcrun',
      ['simctl', 'list', 'devices', 'booted', '--json'],
      { encoding: 'utf8' },
    );
    const { devices } = JSON.parse(raw);
    for (const list of Object.values(devices)) {
      for (const device of list) {
        if (device.name) {
          bootedNames.add(device.name);
        }
      }
    }
  } catch {
    // Fall through to first available target.
  }

  const iphones = targets.filter((target) => target.name.startsWith('iPhone'));
  const pool = iphones.length > 0 ? iphones : targets;
  const preferred =
    pool.find((target) => bootedNames.has(target.name)) ?? pool[0];

  return preferred.device;
};

const pickAvailableAndroidEmulator = async () => {
  const targets = (await getAndroidRunTargets()).filter(
    (target) => target.platform === 'android' && target.type === 'emulator',
  );

  if (targets.length === 0) {
    throw new Error(
      'No Android AVD found. Create one in Android Studio > Device Manager.',
    );
  }

  // Prefer a currently running emulator when possible.
  let runningName;
  try {
    const devices = execFileSync('adb', ['devices'], { encoding: 'utf8' })
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('emulator-') && line.endsWith('device'))
      .map((line) => line.split(/\s+/)[0]);

    for (const serial of devices) {
      try {
        const name = execFileSync(
          'adb',
          ['-s', serial, 'emu', 'avd', 'name'],
          { encoding: 'utf8' },
        )
          .split('\n')[0]
          .trim();
        if (name && targets.some((target) => target.name === name)) {
          runningName = name;
          break;
        }
      } catch {
        // Try next serial.
      }
    }
  } catch {
    // Fall through to first available AVD.
  }

  return runningName ?? targets[0].name;
};

const runners = [];

if (shouldRegisterIos()) {
  try {
    const {
      applePlatform,
      appleSimulator,
    } = await import('@react-native-harness/platform-apple');
    const iosDevice = await pickAvailableIosSimulator();
    runners.push(
      applePlatform({
        name: 'ios',
        device: appleSimulator(iosDevice.name, iosDevice.systemVersion),
        bundleId: 'org.reactjs.native.example.app',
      }),
    );
  } catch (error) {
    console.warn(
      `[rn-harness] Skipping iOS runner: ${error instanceof Error ? error.message : error}`,
    );
  }
} else if (requestedPlatform() !== 'android' && process.platform !== 'darwin') {
  console.warn(
    '[rn-harness] Skipping iOS runner: Apple simulators require macOS.',
  );
}

if (shouldRegisterAndroid()) {
  try {
    const androidEmulatorName = await pickAvailableAndroidEmulator();
    runners.push(
      androidPlatform({
        name: 'android',
        // Use an existing AVD. Without `avd: {...}`, Harness will not create/boot one.
        device: androidEmulator(androidEmulatorName),
        bundleId: 'com.app',
      }),
    );
  } catch (error) {
    console.warn(
      `[rn-harness] Skipping Android runner: ${error instanceof Error ? error.message : error}`,
    );
  }
}

if (runners.length === 0) {
  throw new Error(
    'No harness runners available. Install an iOS Simulator and/or create an Android AVD.',
  );
}

const config = {
  entryPoint: './index.js',
  appRegistryComponentName: 'app',
  defaultRunner: runners[0].name,
  runners,
};

export default config;
