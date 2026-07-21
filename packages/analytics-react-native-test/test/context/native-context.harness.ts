/**
 * On-device harness for NativeContext fields from AmplitudeReactNative.
 *
 * Runs on a real device/simulator (not Jest/Node), so NativeModules are real.
 * Requires react-native-harness + examples/react-native/app built and installed.
 *
 * Native Swift/Kotlin changes require a host rebuild:
 *   FORCE_REBUILD=1 pnpm --filter @amplitude/analytics-react-native-test test:harness:ios
 *   FORCE_REBUILD=1 pnpm --filter @amplitude/analytics-react-native-test test:harness:android
 */
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call */
import { describe, it, expect } from 'react-native-harness';
import { NativeModules } from 'react-native';

// Host app build from examples/react-native/app
// (iOS CURRENT_PROJECT_VERSION / Android versionCode).
const EXPECTED_BUILD = '1';

describe('NativeContext', () => {
  it('returns version and build from the host app', async () => {
    const nativeModule = NativeModules.AmplitudeReactNative;
    expect(nativeModule).toBeDefined();

    const nativeContext = await nativeModule.getApplicationContext({
      adid: true,
      carrier: true,
      deviceManufacturer: true,
      deviceModel: true,
      ipAddress: true,
      language: true,
      osName: true,
      osVersion: true,
      platform: true,
      appSetId: true,
      idfv: true,
      country: true,
    });

    expect(nativeContext.version).toBe('1.0');
    expect(nativeContext.build).toBe(EXPECTED_BUILD);
  });
});
