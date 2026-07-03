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
import { UIManager } from 'react-native';
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
  });

  describe('when neither SRMaskView nor AMPMaskComponentView is available (passthrough)', () => {
    let AmpMask: PassthroughMaskComponent;
    let AmpUnmask: PassthroughUnmaskComponent;
    let errorSpy: jest.SpyInstance;

    beforeEach(() => {
      mockHasViewManagerConfig.mockImplementation(() => false);
      errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      ({ AmpMask, AmpUnmask } = loadMaskFabricModule<PassthroughMaskFabricModule>());
    });

    afterEach(() => {
      errorSpy.mockRestore();
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
});
