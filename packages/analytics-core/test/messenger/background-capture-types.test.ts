import { parseBackgroundCaptureDeviceMode } from '../../src/messenger/background-capture-types';

describe('parseBackgroundCaptureDeviceMode', () => {
  test('accepts desktop, tablet, and mobile', () => {
    expect(parseBackgroundCaptureDeviceMode('desktop')).toBe('desktop');
    expect(parseBackgroundCaptureDeviceMode('tablet')).toBe('tablet');
    expect(parseBackgroundCaptureDeviceMode('mobile')).toBe('mobile');
  });

  test('rejects unknown values', () => {
    expect(parseBackgroundCaptureDeviceMode('phablet')).toBeUndefined();
    expect(parseBackgroundCaptureDeviceMode(null)).toBeUndefined();
  });
});
