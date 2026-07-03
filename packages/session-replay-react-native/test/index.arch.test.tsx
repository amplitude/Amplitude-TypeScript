// index -> fabric -> src/specs/SRMaskViewNativeComponent needs the deep codegen mock
// (see test/specs/SRMaskViewNativeComponent.test.ts and test/fabric/MaskFabric.test.tsx
// for why the manual react-native mock alone doesn't cover this deep default import).
jest.mock('react-native/Libraries/Utilities/codegenNativeComponent', () => ({
  __esModule: true,
  default: (name: string) => name,
}));

// Use the manual mock from __mocks__ directory (adds UIManager.hasViewManagerConfig,
// which defaults to returning true).
jest.mock('react-native');

import type { ReactElement, ReactNode } from 'react';
import type { MaskProps, UnmaskProps, AmpMaskLevel } from '../src/Mask.types';
import type { MaskLevel } from '../src/session-replay-config';

// Shape of props on the native SRMaskView element rendered by fabric's AmpMask/AmpUnmask.
interface NativeMaskElementProps {
  children?: ReactNode;
}

type AnyMaskComponent = (props: MaskProps) => ReactElement<NativeMaskElementProps> | null;
type AnyUnmaskComponent = (props: UnmaskProps) => ReactElement<NativeMaskElementProps> | null;

interface IndexModule {
  init: unknown;
  start: unknown;
  stop: unknown;
  flush: unknown;
  getSessionId: unknown;
  setSessionId: unknown;
  setDeviceId: unknown;
  getSessionReplayProperties: unknown;
  SessionReplayPlugin: unknown;
  AmpMaskView: unknown;
  AmpMask: AnyMaskComponent;
  AmpUnmask: AnyUnmaskComponent;
}

function loadIndexModule(): IndexModule {
  let mod: IndexModule | undefined;
  // isolateModules re-evaluates index's module scope (so isNewArch is recomputed
  // against the globals set by the caller) while preserving the identity of
  // already-mocked modules like 'react-native' — see test/fabric/MaskFabric.test.tsx
  // for why bare jest.resetModules + a static import would break mock identity.
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    mod = require('../src/index') as IndexModule;
  });
  return mod as IndexModule;
}

const FABRIC_MSG_TYPE = 'SRMaskView';
const PAPER_THROW_MSG = '<AmpMask> requires the New Architecture. Use <AmpMaskView> on the Old Architecture.';

describe('index arch switch', () => {
  afterEach(() => {
    delete (global as unknown as { RN$Bridgeless?: boolean }).RN$Bridgeless;
    delete (global as unknown as { nativeFabricUIManager?: unknown }).nativeFabricUIManager;
  });

  describe('RN$Bridgeless === true (bridgeless new arch)', () => {
    let index: IndexModule;

    beforeEach(() => {
      (global as unknown as { RN$Bridgeless?: boolean }).RN$Bridgeless = true;
      index = loadIndexModule();
    });

    it('resolves AmpMask/AmpUnmask from the fabric variant', () => {
      const rendered = index.AmpMask({ children: null });
      expect(rendered?.type).toBe(FABRIC_MSG_TYPE);

      const renderedUnmask = index.AmpUnmask({ children: null });
      expect(renderedUnmask?.type).toBe(FABRIC_MSG_TYPE);
    });
  });

  describe('nativeFabricUIManager != null (fabric new arch)', () => {
    let index: IndexModule;

    beforeEach(() => {
      (global as unknown as { nativeFabricUIManager?: unknown }).nativeFabricUIManager = {};
      index = loadIndexModule();
    });

    it('resolves AmpMask/AmpUnmask from the fabric variant', () => {
      const rendered = index.AmpMask({ children: null });
      expect(rendered?.type).toBe(FABRIC_MSG_TYPE);

      const renderedUnmask = index.AmpUnmask({ children: null });
      expect(renderedUnmask?.type).toBe(FABRIC_MSG_TYPE);
    });
  });

  describe('neither global set (old arch)', () => {
    let index: IndexModule;

    beforeEach(() => {
      index = loadIndexModule();
    });

    it('resolves AmpMask/AmpUnmask from the paper variant', () => {
      // __DEV__ is true under jest; paper's AmpMask/AmpUnmask throw synchronously
      // when called, per src/paper/MaskPaper.tsx. Requiring the module does not throw.
      expect(() => index.AmpMask({ children: null })).toThrow(PAPER_THROW_MSG);
      expect(() => index.AmpUnmask({ children: null })).toThrow(PAPER_THROW_MSG);
    });
  });

  describe('existing exports remain present regardless of arch', () => {
    let index: IndexModule;

    beforeEach(() => {
      index = loadIndexModule();
    });

    it('keeps all pre-existing function/class exports', () => {
      expect(index.init).toBeDefined();
      expect(index.start).toBeDefined();
      expect(index.stop).toBeDefined();
      expect(index.flush).toBeDefined();
      expect(index.getSessionId).toBeDefined();
      expect(index.setSessionId).toBeDefined();
      expect(index.setDeviceId).toBeDefined();
      expect(index.getSessionReplayProperties).toBeDefined();
      expect(index.SessionReplayPlugin).toBeDefined();
    });

    it('keeps AmpMaskView export (=== "AMPMaskComponentView" under the mock)', () => {
      expect(index.AmpMaskView).toBe('AMPMaskComponentView');
    });

    it('exports AmpMask and AmpUnmask', () => {
      expect(index.AmpMask).toBeDefined();
      expect(index.AmpUnmask).toBeDefined();
    });

    it('typechecks old MaskLevel and new AmpMaskLevel/MaskProps/UnmaskProps types side by side', () => {
      const oldLevel: MaskLevel = 'conservative';
      const newLevel: AmpMaskLevel = 'block';
      const maskProps: MaskProps = { enabled: true, maskLevel: newLevel, children: null };
      const unmaskProps: UnmaskProps = { children: null };

      expect(oldLevel).toBe('conservative');
      expect(newLevel).toBe('block');
      expect(maskProps).toBeTruthy();
      expect(unmaskProps).toBeTruthy();
    });
  });
});
