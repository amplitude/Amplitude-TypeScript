// The spec imports the default export from the deep RN submodule path (see
// test/specs/SRMaskViewNativeComponent.test.ts for why this needs its own mock).
// With this mock, SRMaskViewNative under test is the string 'SRMaskView', so a
// rendered element's `type` is `'SRMaskView'`.
jest.mock('react-native/Libraries/Utilities/codegenNativeComponent', () => ({
  __esModule: true,
  default: (name: string) => name,
}));

// Use the manual mock from __mocks__ directory (adds UIManager.hasViewManagerConfig).
jest.mock('react-native');

import React from 'react';
import type { ReactElement, ReactNode } from 'react';
import { NativeModules, TurboModuleRegistry, UIManager } from 'react-native';
import type { MaskProps, UnmaskProps } from '../../src/Mask.types';

// Shape of the props MaskFabric forwards onto the native SRMaskView element.
interface NativeMaskElementProps {
  enabled: boolean;
  unmask: boolean;
  maskLevel: string;
  style: { display: string };
  children?: ReactNode;
}

// Shape of the props on the passthrough Fragment element.
interface PassthroughElementProps {
  children?: ReactNode;
}

// Shape of the props MaskFabric forwards onto the fallback AmpMaskView element.
interface FallbackMaskElementProps {
  mask: 'amp-mask' | 'amp-unmask' | 'amp-block';
  enabled?: boolean;
  style?: unknown;
  children?: ReactNode;
}

type NativeMaskComponent = (props: MaskProps) => ReactElement<NativeMaskElementProps> | null;
type NativeUnmaskComponent = (props: UnmaskProps) => ReactElement<NativeMaskElementProps> | null;
type PassthroughMaskComponent = (props: MaskProps) => ReactElement<PassthroughElementProps> | null;
type PassthroughUnmaskComponent = (props: UnmaskProps) => ReactElement<PassthroughElementProps> | null;
type FallbackMaskComponent = (props: MaskProps) => ReactElement<FallbackMaskElementProps> | null;
type FallbackUnmaskComponent = (props: UnmaskProps) => ReactElement<FallbackMaskElementProps> | null;

interface NativeMaskFabricModule {
  AmpMask: NativeMaskComponent;
  AmpUnmask: NativeUnmaskComponent;
}

interface PassthroughMaskFabricModule {
  AmpMask: PassthroughMaskComponent;
  AmpUnmask: PassthroughUnmaskComponent;
}

interface FallbackMaskFabricModule {
  AmpMask: FallbackMaskComponent;
  AmpUnmask: FallbackUnmaskComponent;
}

function loadMaskFabricModule<T>(): T {
  let mod: T | undefined;
  // isolateModules re-evaluates MaskFabric's module scope (so NATIVE_AVAILABLE is
  // recomputed against the current hasViewManagerConfig mock return value) while
  // preserving the identity of already-mocked modules like 'react-native', so the
  // top-level `UIManager` import above stays the same object MaskFabric resolves.
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    mod = require('../../src/fabric/MaskFabric') as T;
  });
  return mod as T;
}

const mockHasViewManagerConfig = UIManager.hasViewManagerConfig as jest.Mock;

// The mock's NativeModules export is a plain object (see
// test/__mocks__/react-native.ts) with AMPNativeSessionReplay present by
// default, and TurboModuleRegistry.get/getEnforcing are jest.fn mocks that
// resolve the same module. Tier-3 tests need to toggle the recorder's
// presence to distinguish "recorder truly absent" from "recorder present but
// unreachable" — mutate BOTH resolution paths (NativeModules and
// TurboModuleRegistry.get) since MaskFabric now probes the same way
// src/native-module.ts does, and always restore so other suites still see
// the module.
const nativeModules = NativeModules as { AMPNativeSessionReplay?: unknown };
const originalAmpNativeSessionReplay = nativeModules.AMPNativeSessionReplay;
const mockTurboModuleRegistryGet = TurboModuleRegistry.get as jest.Mock;
function removeRecorder(): void {
  delete nativeModules.AMPNativeSessionReplay;
  mockTurboModuleRegistryGet.mockReturnValue(null);
}
function restoreRecorder(): void {
  nativeModules.AMPNativeSessionReplay = originalAmpNativeSessionReplay;
  mockTurboModuleRegistryGet.mockReturnValue(originalAmpNativeSessionReplay);
}

describe('MaskFabric', () => {
  describe('when native view manager is available', () => {
    let AmpMask: NativeMaskComponent;
    let AmpUnmask: NativeUnmaskComponent;

    beforeEach(() => {
      mockHasViewManagerConfig.mockReturnValue(true);
      ({ AmpMask, AmpUnmask } = loadMaskFabricModule<NativeMaskFabricModule>());
    });

    it('probes hasViewManagerConfig with SRMaskView', () => {
      expect(mockHasViewManagerConfig).toHaveBeenCalledWith('SRMaskView');
    });

    it('renders SRMaskView with default enabled=true, unmask=false, maskLevel="mask"', () => {
      const child = React.createElement('Text', null, 'hello');
      const rendered = AmpMask({ children: child });

      expect(rendered?.type).toBe('SRMaskView');
      expect(rendered?.props.enabled).toBe(true);
      expect(rendered?.props.unmask).toBe(false);
      expect(rendered?.props.maskLevel).toBe('mask');
      expect(rendered?.props.children).toBe(child);
      expect(rendered?.props.style).toEqual({ display: 'contents' });
    });

    it('respects explicit enabled=false', () => {
      const rendered = AmpMask({ enabled: false, children: null });
      expect(rendered?.props.enabled).toBe(false);
    });

    it('respects explicit maskLevel="block"', () => {
      const rendered = AmpMask({ maskLevel: 'block', children: null });
      expect(rendered?.props.maskLevel).toBe('block');
    });

    it('always renders unmask=false for AmpMask regardless of caller props', () => {
      const rendered = AmpMask({ children: null });
      expect(rendered?.props.unmask).toBe(false);
    });

    it('forces style to display:contents even when caller passes their own style', () => {
      // `style` is a type error by design (see Mask.types.ts) but is still
      // runtime-defended against untyped/JS callers, hence the cast here.
      const rendered = AmpMask({ children: null, style: { flex: 1 } } as unknown as MaskProps);
      expect(rendered?.props.style).toEqual({ display: 'contents' });
    });

    it('renders AmpUnmask as SRMaskView with unmask=true, enabled=true', () => {
      const child = React.createElement('Text', null, 'hello');
      const rendered = AmpUnmask({ children: child });

      expect(rendered?.type).toBe('SRMaskView');
      expect(rendered?.props.unmask).toBe(true);
      expect(rendered?.props.enabled).toBe(true);
      expect(rendered?.props.maskLevel).toBe('mask');
      expect(rendered?.props.children).toBe(child);
      expect(rendered?.props.style).toEqual({ display: 'contents' });
    });

    it('forces style to display:contents for AmpUnmask even when caller passes their own style', () => {
      // `style` is a type error by design (see Mask.types.ts) but is still
      // runtime-defended against untyped/JS callers, hence the cast here.
      const rendered = AmpUnmask({ children: null, style: { flex: 1 } } as unknown as UnmaskProps);
      expect(rendered?.props.style).toEqual({ display: 'contents' });
    });
  });

  describe('when SRMaskView is unavailable but AMPMaskComponentView is available (fail-closed fallback)', () => {
    let AmpMask: FallbackMaskComponent;
    let AmpUnmask: FallbackUnmaskComponent;
    let errorSpy: jest.SpyInstance;

    beforeEach(() => {
      mockHasViewManagerConfig.mockImplementation((name: string) => name === 'AMPMaskComponentView');
      errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      ({ AmpMask, AmpUnmask } = loadMaskFabricModule<FallbackMaskFabricModule>());
    });

    afterEach(() => {
      errorSpy.mockRestore();
    });

    it('probes hasViewManagerConfig with SRMaskView and AMPMaskComponentView', () => {
      expect(mockHasViewManagerConfig).toHaveBeenCalledWith('SRMaskView');
      expect(mockHasViewManagerConfig).toHaveBeenCalledWith('AMPMaskComponentView');
    });

    it('AmpMask renders AmpMaskView with mask="amp-mask" by default', () => {
      const child = React.createElement('Text', null, 'hello');
      const rendered = AmpMask({ children: child });

      expect(rendered?.type).toBe('AMPMaskComponentView');
      expect(rendered?.props.mask).toBe('amp-mask');
      expect(rendered?.props.children).toBe(child);
    });

    it('AmpMask renders AmpMaskView with mask="amp-block" when maskLevel="block"', () => {
      const rendered = AmpMask({ maskLevel: 'block', children: null });

      expect(rendered?.type).toBe('AMPMaskComponentView');
      expect(rendered?.props.mask).toBe('amp-block');
    });

    it('AmpUnmask renders AmpMaskView with mask="amp-unmask"', () => {
      const child = React.createElement('Text', null, 'hello');
      const rendered = AmpUnmask({ children: child });

      expect(rendered?.type).toBe('AMPMaskComponentView');
      expect(rendered?.props.mask).toBe('amp-unmask');
      expect(rendered?.props.children).toBe(child);
    });

    it('ignores enabled=false and still masks (fails toward privacy)', () => {
      const rendered = AmpMask({ enabled: false, children: null });

      expect(rendered?.type).toBe('AMPMaskComponentView');
      expect(rendered?.props.mask).toBe('amp-mask');
    });

    it('logs a one-time console.error warning that content stays MASKED via AmpMaskView, across multiple renders', () => {
      AmpMask({ children: React.createElement('Text', null, 'a') });
      AmpMask({ children: React.createElement('Text', null, 'b') });
      AmpUnmask({ children: React.createElement('Text', null, 'c') });

      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('MASKED'));
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('AmpMaskView'));
    });

    it('a caller-supplied mask prop does not override the forced value on AmpMask', () => {
      // Untyped/JS callers can spread a stray `mask` prop through; the
      // forced value must win. Cast needed since `mask` isn't on MaskProps.
      const rendered = AmpMask({ children: null, mask: 'amp-unmask' } as unknown as MaskProps);
      expect(rendered?.props.mask).toBe('amp-mask');
    });

    it('a caller-supplied mask prop does not override the forced value on AmpUnmask', () => {
      const rendered = AmpUnmask({ children: null, mask: 'amp-mask' } as unknown as UnmaskProps);
      expect(rendered?.props.mask).toBe('amp-unmask');
    });

    it('does not forward enabled or style onto the rendered AmpMaskView element (AmpMask)', () => {
      const rendered = AmpMask({
        enabled: false,
        children: null,
        style: { flex: 1 },
      } as unknown as MaskProps);
      expect(rendered?.props.enabled).toBeUndefined();
      expect(rendered?.props.style).toBeUndefined();
    });

    it('does not forward enabled or style onto the rendered AmpMaskView element (AmpUnmask)', () => {
      const rendered = AmpUnmask({
        children: null,
        enabled: false,
        style: { flex: 1 },
      } as unknown as UnmaskProps);
      expect(rendered?.props.enabled).toBeUndefined();
      expect(rendered?.props.style).toBeUndefined();
    });
  });

  describe('when neither SRMaskView nor AMPMaskComponentView is available and the recorder is absent (passthrough)', () => {
    let AmpMask: PassthroughMaskComponent;
    let AmpUnmask: PassthroughUnmaskComponent;
    let errorSpy: jest.SpyInstance;

    beforeEach(() => {
      mockHasViewManagerConfig.mockImplementation(() => false);
      removeRecorder();
      errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      ({ AmpMask, AmpUnmask } = loadMaskFabricModule<PassthroughMaskFabricModule>());
    });

    afterEach(() => {
      errorSpy.mockRestore();
      restoreRecorder();
    });

    it('probes hasViewManagerConfig with SRMaskView and AMPMaskComponentView', () => {
      expect(mockHasViewManagerConfig).toHaveBeenCalledWith('SRMaskView');
      expect(mockHasViewManagerConfig).toHaveBeenCalledWith('AMPMaskComponentView');
    });

    it('AmpMask renders children directly without SRMaskView in the tree', () => {
      const child = React.createElement('Text', null, 'hello');
      const rendered = AmpMask({ children: child });

      expect(rendered?.type).not.toBe('SRMaskView');
      // Fragment wrapping children.
      expect(rendered?.type).toBe(React.Fragment);
      expect(rendered?.props.children).toBe(child);
    });

    it('AmpUnmask renders children directly without SRMaskView in the tree', () => {
      const child = React.createElement('Text', null, 'hello');
      const rendered = AmpUnmask({ children: child });

      expect(rendered?.type).not.toBe('SRMaskView');
      expect(rendered?.type).toBe(React.Fragment);
      expect(rendered?.props.children).toBe(child);
    });

    it('logs a one-time console.error warning that children render UNMASKED, across multiple renders', () => {
      AmpMask({ children: React.createElement('Text', null, 'a') });
      AmpMask({ children: React.createElement('Text', null, 'b') });
      AmpUnmask({ children: React.createElement('Text', null, 'c') });

      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('UNMASKED'));
    });
  });

  describe('when neither SRMaskView nor AMPMaskComponentView is available but the recorder IS present (should-be-unreachable build error)', () => {
    beforeEach(() => {
      mockHasViewManagerConfig.mockImplementation(() => false);
      // Recorder present by default in the mock; be explicit for clarity.
      restoreRecorder();
    });

    describe('in development (__DEV__ = true)', () => {
      it('AmpMask throws a clear build-error message instead of silently passing content through', () => {
        const { AmpMask } = loadMaskFabricModule<PassthroughMaskFabricModule>();
        expect(() => AmpMask({ children: null })).toThrow(/neither SRMaskView nor AMPMaskComponentView is registered/);
      });

      it('AmpUnmask throws a clear build-error message instead of silently passing content through', () => {
        const { AmpUnmask } = loadMaskFabricModule<PassthroughMaskFabricModule>();
        expect(() => AmpUnmask({ children: null })).toThrow(
          /neither SRMaskView nor AMPMaskComponentView is registered/,
        );
      });
    });

    describe('in production (__DEV__ = false)', () => {
      const globalWithDev = global as unknown as { __DEV__: boolean };
      let originalDev: boolean;
      let errorSpy: jest.SpyInstance;

      beforeEach(() => {
        originalDev = globalWithDev.__DEV__;
        globalWithDev.__DEV__ = false;
        errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      });

      afterEach(() => {
        globalWithDev.__DEV__ = originalDev;
        errorSpy.mockRestore();
      });

      it('AmpMask warns once and renders children directly (Fragment)', () => {
        const { AmpMask } = loadMaskFabricModule<PassthroughMaskFabricModule>();
        const child = React.createElement('Text', null, 'hello');
        const rendered = AmpMask({ children: child });

        expect(rendered?.type).toBe(React.Fragment);
        expect(rendered?.props.children).toBe(child);
        expect(errorSpy).toHaveBeenCalledTimes(1);
        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('build error'));
      });

      it('AmpUnmask warns once (shared with AmpMask) and renders children directly (Fragment)', () => {
        const { AmpMask, AmpUnmask } = loadMaskFabricModule<PassthroughMaskFabricModule>();
        AmpMask({ children: React.createElement('Text', null, 'a') });
        const child = React.createElement('Text', null, 'b');
        const rendered = AmpUnmask({ children: child });

        expect(rendered?.type).toBe(React.Fragment);
        expect(rendered?.props.children).toBe(child);
        expect(errorSpy).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('when the recorder is reachable ONLY via TurboModuleRegistry (NativeModules interop proxy misses it)', () => {
    // Regression test for the Bugbot finding: the probe must resolve the
    // native module the same way src/native-module.ts does
    // (TurboModuleRegistry.get first), not solely via NativeModules. If the
    // TurboModule is linked but not exposed on the NativeModules interop
    // proxy, the old NativeModules-only probe would read false and the
    // Passthrough tier would render children UNMASKED while the recorder can
    // still record — exactly the scenario simulated here.
    beforeEach(() => {
      mockHasViewManagerConfig.mockImplementation(() => false);
      delete nativeModules.AMPNativeSessionReplay;
      mockTurboModuleRegistryGet.mockReturnValue(originalAmpNativeSessionReplay);
    });

    afterEach(() => {
      restoreRecorder();
    });

    describe('in development (__DEV__ = true)', () => {
      it('AmpMask is the UnmaskableGuard: throws a build-error message rather than silently passing through', () => {
        const { AmpMask } = loadMaskFabricModule<PassthroughMaskFabricModule>();
        expect(() => AmpMask({ children: null })).toThrow(/neither SRMaskView nor AMPMaskComponentView is registered/);
      });

      it('AmpUnmask is the UnmaskableGuard: throws a build-error message rather than silently passing through', () => {
        const { AmpUnmask } = loadMaskFabricModule<PassthroughMaskFabricModule>();
        expect(() => AmpUnmask({ children: null })).toThrow(
          /neither SRMaskView nor AMPMaskComponentView is registered/,
        );
      });
    });
  });
});
