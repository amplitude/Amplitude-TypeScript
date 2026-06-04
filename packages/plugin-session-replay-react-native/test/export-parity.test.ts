// Regression guard for SDKRN-14.
//
// After the plugin was de-duplicated to re-export the standalone
// `@amplitude/session-replay-react-native` package, the only thing protecting
// downstream consumers from a silent breaking change is the re-export block in
// `src/index.tsx`. This file locks in that public surface on two axes:
//
//   1. Runtime (value) exports — asserted with `Object.keys` against an
//      explicit allowlist, so a dropped/renamed value export fails here.
//   2. Types — compile-time `Equals`/`Expect` assertions checked by
//      `pnpm typecheck` (`tsc -p tsconfig.json`, which includes `test/`).
//      `@ts-expect-error` negative controls prove the assertions are real and
//      not tautological (they fail if `Equals` ever stops detecting a diff).
//
// It also re-verifies the `maskLevel` passthrough contract to the native layer
// for every `MaskLevel` member.

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-var-requires */

jest.mock('react-native');

import * as pluginModule from '../src/index';
import type {
  MaskLevel as PluginMaskLevel,
  PrivacyConfig as PluginPrivacyConfig,
  SessionReplayPluginConfig as PluginSessionReplayPluginConfig,
  SessionReplayConfig as PluginSessionReplayConfig,
} from '../src/index';
import type {
  MaskLevel as StandaloneMaskLevel,
  PrivacyConfig as StandalonePrivacyConfig,
  SessionReplayPluginConfig as StandaloneSessionReplayPluginConfig,
} from '@amplitude/session-replay-react-native';
import { LogLevel } from '@amplitude/analytics-types';
import type { ReactNativeConfig } from '@amplitude/analytics-types';
import mockReactNativeClient from './utils/reactNativeClient';

// ---------------------------------------------------------------------------
// Compile-time type-compatibility assertions (validated by `tsc`, not Jest).
// ---------------------------------------------------------------------------

// Invariant (not bivariant) type equality: `true` only when X and Y are
// mutually assignable AND structurally identical. A removed/added/renamed field
// on either side flips this to `false`.
type Equals<X, Y> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

// Helper sanity: prove `Equals` is not vacuous — it distinguishes identical
// shapes (`true`) from structurally different ones (`false`). If `Equals` ever
// regressed to always-`true`, `_equalsDistinguishesShapes` would fail to
// compile (annotation `true` vs value `false`), so every assertion below is a
// real check, not a tautology.
const _equalsMatchesIdenticalShapes: Equals<{ a: number }, { a: number }> = true;
const _equalsDistinguishesShapes: Equals<{ a: number }, { a: number; b: number }> = false;

// Positive parity assertions. Each tuple element resolves to `true` only when
// the corresponding parity holds; otherwise `Expect<false>` fails to satisfy
// its `extends true` constraint and typecheck (and ts-jest) fails on that line.
const _parityTypeChecks: [
  // MaskLevel is a string-literal union (NOT an enum): lock the exact members.
  Expect<Equals<PluginMaskLevel, 'light' | 'medium' | 'conservative'>>,
  // The plugin must re-export types structurally identical to the standalone's.
  Expect<Equals<PluginMaskLevel, StandaloneMaskLevel>>,
  Expect<Equals<PluginPrivacyConfig, StandalonePrivacyConfig>>,
  Expect<Equals<PluginSessionReplayPluginConfig, StandaloneSessionReplayPluginConfig>>,
  // The deprecated alias must remain a pure alias of the current config type.
  Expect<Equals<PluginSessionReplayConfig, PluginSessionReplayPluginConfig>>,
  // Lock the exact field sets so a removed/renamed field is caught explicitly.
  Expect<Equals<keyof PluginPrivacyConfig, 'maskLevel'>>,
  Expect<Equals<PluginPrivacyConfig['maskLevel'], PluginMaskLevel | undefined>>,
  Expect<
    Equals<
      keyof PluginSessionReplayPluginConfig,
      'sampleRate' | 'enableRemoteConfig' | 'logLevel' | 'autoStart' | 'privacyConfig'
    >
  >,
] = [true, true, true, true, true, true, true, true];

// Negative control: MaskLevel must reject unknown members. This assignment is
// expected to fail; if a member like 'opaque' were ever added to MaskLevel the
// error would disappear and `@ts-expect-error` would itself error (unused),
// failing the build.
// @ts-expect-error 'opaque' is not a valid MaskLevel member.
const _maskLevelRejectsUnknown: PluginMaskLevel = 'opaque';

// ---------------------------------------------------------------------------
// Runtime (value) export-surface assertions (validated by Jest).
// ---------------------------------------------------------------------------

const minimalConfig: ReactNativeConfig = {
  apiKey: 'test-api-key',
  serverZone: 'US',
  deviceId: 'test-device-id',
  sessionId: 12345,
  userId: 'test-user-id',
  optOut: false,
  cookieExpiration: 0,
  cookieSameSite: 'Lax',
  cookieSecure: false,
  cookieStorage: undefined as never,
  cookieUpgrade: false,
  disableCookies: false,
  domain: 'test.com',
  sessionTimeout: 1800000,
  trackingOptions: {},
  flushIntervalMillis: 10000,
  flushMaxRetries: 5,
  flushQueueSize: 10,
  logLevel: LogLevel.Warn,
  loggerProvider: undefined as never,
  transportProvider: undefined as never,
  useBatch: false,
  attribution: undefined,
  serverUrl: undefined,
  appVersion: undefined,
  lastEventTime: undefined,
  lastEventId: undefined,
  partnerId: undefined,
  trackingSessionEvents: undefined,
  migrateLegacyData: undefined,
};

describe('plugin export parity (SDKRN-14 regression guard)', () => {
  it('type-compatibility assertions compile (validated by tsc / ts-jest)', () => {
    // The real validation happens at compile time above; referencing the guards
    // here keeps them live (satisfies noUnusedLocals) and documents intent.
    expect(_equalsMatchesIdenticalShapes).toBe(true);
    expect(_equalsDistinguishesShapes).toBe(false);
    expect(_parityTypeChecks).toHaveLength(8);
    expect(_maskLevelRejectsUnknown).toBe('opaque');
  });

  describe('runtime value surface', () => {
    it('exports exactly the expected runtime (value) members', () => {
      // `export type { ... }` members (MaskLevel, PrivacyConfig,
      // SessionReplayPluginConfig, SessionReplayConfig) are erased at runtime,
      // so only the two value exports remain. A dropped/added value export
      // (e.g. the plugin class or the mask view) breaks this assertion.
      const runtimeExports = Object.keys(pluginModule)
        .filter((key) => key !== '__esModule' && key !== 'default')
        .sort();
      expect(runtimeExports).toEqual(['AmpMaskView', 'SessionReplayPlugin']);
    });

    it('SessionReplayPlugin is the standalone enrichment plugin class', () => {
      const plugin = new pluginModule.SessionReplayPlugin();
      expect(plugin).toBeInstanceOf(pluginModule.SessionReplayPlugin);
      expect(plugin.name).toBe('@amplitude/plugin-session-replay-react-native');
      expect(plugin.type).toBe('enrichment');
    });

    it('AmpMaskView resolves to the standalone native component', () => {
      expect(pluginModule.AmpMaskView).toBe('AMPMaskComponentView');
    });
  });

  describe('maskLevel passthrough to the native layer', () => {
    const maskLevels: PluginMaskLevel[] = ['light', 'medium', 'conservative'];

    it.each(maskLevels)('forwards privacyConfig.maskLevel="%s" to native setup', async (maskLevel) => {
      jest.resetModules();
      const index = require('../src/index');
      const nativeModule = require('react-native').NativeModules.AMPNativeSessionReplay;
      jest.clearAllMocks();

      const plugin = new index.SessionReplayPlugin({ privacyConfig: { maskLevel } });
      await plugin.setup(minimalConfig, mockReactNativeClient);

      expect(nativeModule.setup).toHaveBeenCalledWith(expect.objectContaining({ maskLevel }));
    });

    it('defaults to "medium" when no privacyConfig is provided', async () => {
      jest.resetModules();
      const index = require('../src/index');
      const nativeModule = require('react-native').NativeModules.AMPNativeSessionReplay;
      jest.clearAllMocks();

      const plugin = new index.SessionReplayPlugin();
      await plugin.setup(minimalConfig, mockReactNativeClient);

      expect(nativeModule.setup).toHaveBeenCalledWith(expect.objectContaining({ maskLevel: 'medium' }));
    });
  });
});
