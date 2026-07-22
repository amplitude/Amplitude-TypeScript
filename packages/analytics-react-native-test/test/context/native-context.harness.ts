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
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */
import { describe, it, expect } from 'react-native-harness';
import { NativeModules, Platform } from 'react-native';
import { MemoryStorage, UserSession, getCookieName } from '@amplitude/analytics-core';
import { createInstance, Types } from '@amplitude/analytics-react-native';
import { createEventCapture, EventCapture } from '../helpers/event-capture';

// Host app build from examples/react-native/app
// (iOS CURRENT_PROJECT_VERSION / Android versionCode).
const EXPECTED_VERSION = '1.0';
const EXPECTED_BUILD = '1';
const API_KEY = 'dummyApiKey';

const APP_VERSION = '[Amplitude] Version';
const APP_BUILD = '[Amplitude] Build';
const PREVIOUS_VERSION = '[Amplitude] Previous Version';
const PREVIOUS_BUILD = '[Amplitude] Previous Build';

async function initWithAppLifecycles(cookieStorage: MemoryStorage<UserSession>): Promise<EventCapture> {
  const client = createInstance();
  const capture = createEventCapture();
  client.add(capture.plugin);

  await client.init(API_KEY, 'harness-user', {
    flushQueueSize: 1,
    logLevel: Types.LogLevel.None,
    attribution: {
      disabled: true,
    },
    cookieStorage,
    autocapture: {
      appLifecycles: true,
      sessions: false,
    },
  } as any).promise;

  return capture;
}

async function seedPreviousAppInfo(
  cookieStorage: MemoryStorage<UserSession>,
  previous: Pick<UserSession, 'appVersion' | 'appBuild'>,
): Promise<void> {
  await cookieStorage.set(getCookieName(API_KEY), {
    optOut: false,
    ...previous,
  });
}

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

    expect(nativeContext.version).toBe(EXPECTED_VERSION);
    expect(nativeContext.build).toBe(EXPECTED_BUILD);
  });

  it('tracks Application Installed with native version and build when no previous build', async () => {
    // Fresh in-memory cookie storage so previousBuild is unset.
    // (Harness host opts out of AsyncStorage — see SDKRN-8.)
    const cookieStorage = new MemoryStorage<UserSession>();
    const capture = await initWithAppLifecycles(cookieStorage);

    // Application Opened (cold start) + Application Installed
    await capture.waitForEvents(2);

    const installed = capture.events.find((e) => e.event_type === '[Amplitude] Application Installed');
    expect(installed).toBeDefined();
    expect(installed?.event_properties).toEqual({
      [APP_VERSION]: EXPECTED_VERSION,
      [APP_BUILD]: EXPECTED_BUILD,
    });
  });

  it('does not track Application Installed if previous build is present', async () => {
    const cookieStorage = new MemoryStorage<UserSession>();
    await seedPreviousAppInfo(cookieStorage, {
      appVersion: EXPECTED_VERSION,
      appBuild: EXPECTED_BUILD,
    });

    const capture = await initWithAppLifecycles(cookieStorage);

    // Only Application Opened — same build, so no Installed / Updated.
    await capture.waitForEvents(1);
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(capture.events.map((e) => e.event_type)).toEqual(['[Amplitude] Application Opened']);
  });

  it('tracks Application Updated if previous build is different from current build', async () => {
    const cookieStorage = new MemoryStorage<UserSession>();
    await seedPreviousAppInfo(cookieStorage, {
      appVersion: '0.9',
      appBuild: '0',
    });

    const capture = await initWithAppLifecycles(cookieStorage);

    // Application Opened + Application Updated
    await capture.waitForEvents(2);

    const updated = capture.events.find((e) => e.event_type === '[Amplitude] Application Updated');
    expect(updated).toBeDefined();
    expect(updated?.event_properties).toEqual({
      [APP_VERSION]: EXPECTED_VERSION,
      [APP_BUILD]: EXPECTED_BUILD,
      [PREVIOUS_VERSION]: '0.9',
      [PREVIOUS_BUILD]: '0',
    });
    expect(capture.events.some((e) => e.event_type === '[Amplitude] Application Installed')).toBe(false);
  });

  it('does not track Application Updated if previous build is the same as current build (Android)', async () => {
    if (Platform.OS === 'ios') {
      return;
    }

    const cookieStorage = new MemoryStorage<UserSession>();
    await seedPreviousAppInfo(cookieStorage, {
      appVersion: '0.9',
      appBuild: EXPECTED_BUILD,
    });

    const capture = await initWithAppLifecycles(cookieStorage);

    // Amplitude-Kotlin: build-only — version change alone is ignored.
    await capture.waitForEvents(1);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(capture.events.map((e) => e.event_type)).toEqual(['[Amplitude] Application Opened']);
  });

  describe('iOS', () => {
    it('tracks Application Installed if previous version is undefined', async () => {
      if (Platform.OS !== 'ios') {
        return;
      }

      const cookieStorage = new MemoryStorage<UserSession>();
      // Build present but version never persisted — still treated as install on iOS.
      await seedPreviousAppInfo(cookieStorage, {
        appBuild: EXPECTED_BUILD,
      });

      const capture = await initWithAppLifecycles(cookieStorage);

      await capture.waitForEvents(2);

      const installed = capture.events.find((e) => e.event_type === '[Amplitude] Application Installed');
      expect(installed).toBeDefined();
      expect(installed?.event_properties).toEqual({
        [APP_VERSION]: EXPECTED_VERSION,
        [APP_BUILD]: EXPECTED_BUILD,
      });
      expect(capture.events.some((e) => e.event_type === '[Amplitude] Application Updated')).toBe(false);
    });

    it('tracks Application Updated if previous version is different from current version', async () => {
      if (Platform.OS !== 'ios') {
        return;
      }

      const cookieStorage = new MemoryStorage<UserSession>();
      await seedPreviousAppInfo(cookieStorage, {
        appVersion: '0.9',
        appBuild: EXPECTED_BUILD,
      });

      const capture = await initWithAppLifecycles(cookieStorage);

      await capture.waitForEvents(2);

      const updated = capture.events.find((e) => e.event_type === '[Amplitude] Application Updated');
      expect(updated).toBeDefined();
      expect(updated?.event_properties).toEqual({
        [APP_VERSION]: EXPECTED_VERSION,
        [APP_BUILD]: EXPECTED_BUILD,
        [PREVIOUS_VERSION]: '0.9',
        [PREVIOUS_BUILD]: EXPECTED_BUILD,
      });
      expect(capture.events.some((e) => e.event_type === '[Amplitude] Application Installed')).toBe(false);
    });
  });
});
