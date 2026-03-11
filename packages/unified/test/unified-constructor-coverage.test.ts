jest.mock('@amplitude/analytics-browser', () => {
  function AmplitudeBrowserMock() {
    return undefined;
  }

  return {
    AmplitudeBrowser: AmplitudeBrowserMock,
  };
});

import { AmplitudeUnified } from '../src/unified';

describe('AmplitudeUnified constructor coverage', () => {
  test('covers fallback branch when super call returns undefined', () => {
    const client = new AmplitudeUnified();
    expect(client).toBeDefined();
  });
});
