// FIXME: remove these eslint rules
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-var-requires */

jest.mock('react-native');

const MSG = '<AmpMask> requires the New Architecture. Use <AmpMaskView> on the Old Architecture.';

type MaskPaperModule = typeof import('../../src/paper/MaskPaper');

function loadMaskPaper(): MaskPaperModule {
  return require('../../src/paper/MaskPaper') as MaskPaperModule;
}

function setDev(value: boolean): void {
  (global as unknown as { __DEV__: boolean }).__DEV__ = value;
}

describe('MaskPaper', () => {
  afterEach(() => {
    setDev(true);
    jest.resetModules();
    jest.restoreAllMocks();
  });

  describe('when __DEV__ is true', () => {
    it('AmpMask throws the documented message', () => {
      setDev(true);
      const { AmpMask } = loadMaskPaper();
      expect(() => AmpMask({ children: null })).toThrow(MSG);
    });

    it('AmpUnmask throws the documented message', () => {
      setDev(true);
      const { AmpUnmask } = loadMaskPaper();
      expect(() => AmpUnmask({ children: null })).toThrow(MSG);
    });
  });

  describe('when __DEV__ is false', () => {
    beforeEach(() => {
      setDev(false);
      jest.resetModules();
    });

    it('AmpMask renders AmpMaskView with mask="amp-mask" by default', () => {
      const { AmpMask } = loadMaskPaper();
      const element = AmpMask({ children: 'hello' });
      expect(element.type).toBe('AMPMaskComponentView');
      expect(element.props.mask).toBe('amp-mask');
      expect(element.props.children).toBe('hello');
    });

    it('AmpMask renders AmpMaskView with mask="amp-block" when maskLevel="block"', () => {
      const { AmpMask } = loadMaskPaper();
      const element = AmpMask({ maskLevel: 'block', children: 'hello' });
      expect(element.type).toBe('AMPMaskComponentView');
      expect(element.props.mask).toBe('amp-block');
    });

    it('AmpUnmask renders AmpMaskView with mask="amp-unmask"', () => {
      const { AmpUnmask } = loadMaskPaper();
      const element = AmpUnmask({ children: 'world' });
      expect(element.type).toBe('AMPMaskComponentView');
      expect(element.props.mask).toBe('amp-unmask');
      expect(element.props.children).toBe('world');
    });

    it('calls console.error exactly once across multiple AmpMask + AmpUnmask calls', () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      const { AmpMask, AmpUnmask } = loadMaskPaper();

      AmpMask({ children: null });
      AmpMask({ maskLevel: 'block', children: null });
      AmpUnmask({ children: null });

      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('AmpMaskView'));
    });
  });
});
