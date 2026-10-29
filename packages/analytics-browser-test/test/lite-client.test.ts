/* eslint-disable @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-return */

import { AmplitudeBrowser as AmplitudeBrowserLite } from '@amplitude/analytics-browser/lite';
import * as amplitudeLite from '@amplitude/analytics-browser/lite';
import { AmplitudeBrowser } from '@amplitude/analytics-browser';
import * as amplitude from '@amplitude/analytics-browser';
import type { Types } from '@amplitude/analytics-browser';
import type { Types as TypesLite } from '@amplitude/analytics-browser/lite';

const amplitudeCjs = require('@amplitude/analytics-browser');
const amplitudeCjsLite = require('@amplitude/analytics-browser/lite');

describe('imports', () => {
  it('default import should match named requires import', () => {
    expect(AmplitudeBrowserLite).toBe(amplitudeLite.AmplitudeBrowser);
    expect(AmplitudeBrowser).toBe(amplitude.AmplitudeBrowser);
    expect(amplitudeCjs.AmplitudeBrowser).toBe(amplitude.AmplitudeBrowser);
    expect(amplitudeCjsLite.AmplitudeBrowser).toBe(amplitudeLite.AmplitudeBrowser);
    expect(typeof amplitudeLite.AmplitudeBrowser).toBe('function');
    expect(typeof amplitudeLite.AmplitudeBrowser).toBe('function');
  });
});

describe('AmplitudeBrowser vs AmplitudeBrowserLite', () => {
  beforeAll(async () => {
    // define 'getEntriesByType' on window.performance
    window.performance.getEntriesByType = jest.fn().mockReturnValue([]);
  });

  it('should not autocapture AmplitudeBrowserLite if autocapture=true', async () => {
    const amplitude = new AmplitudeBrowserLite() as any;
    const events: any[] = [];
    const originalTrack = amplitude.track;
    amplitude.track = jest.fn(amplitude.track).mockImplementation(async (...args: any[]) => {
      events.push(args);
      return await originalTrack.apply(amplitude, args);
    });
    const config: TypesLite.BrowserOptions = {
      autocapture: true,
      identityStorage: 'none',
    };
    await amplitude.init('test', 'testUser', config).promise;
    amplitude.track('test');
    expect(events).toHaveLength(1); // just one event, the "test" event, no autocapture
    expect(events[0]).toEqual(['test']);
  });

  it('should autocapture on AmplitudeBrowser if autocapture=true', async () => {
    const amplitude = new AmplitudeBrowser() as any;
    const events: any[] = [];
    const originalTrack = amplitude.track;
    amplitude.track = jest.fn(amplitude.track).mockImplementation(async (...args: any[]) => {
      events.push(args);
      return await originalTrack.apply(amplitude, args);
    });
    const config: Types.BrowserOptions = {
      autocapture: true,
      identityStorage: 'none',
    };
    await amplitude.init('test', 'testUser', config).promise;
    await amplitude.track('test');
    expect(events.length).toBe(4);
    expect(events[0][0].event_type).toBe('$identify');
    expect(events[1][0]).toBe('session_start');
    expect(events[2][0].event_type).toBe('[Amplitude] Page Viewed');
    expect(events[3][0]).toBe('test');
  });
});
