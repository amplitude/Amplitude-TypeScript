jest.mock('@amplitude/analytics-browser', () => {
  function AmplitudeBrowserMock() {
    return undefined;
  }

  return {
    AmplitudeBrowser: AmplitudeBrowserMock,
  };
});

import { AmplitudeUnified } from '../src/unified';

describe('AmplitudeUnified instantiation coverage', () => {
  test('covers class instantiation when super call returns undefined', () => {
    const client = new AmplitudeUnified();
    expect(client).toBeDefined();
  });
});
