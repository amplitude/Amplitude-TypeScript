import { describe, it, expect } from 'vitest';
import { forceAutocaptureOn } from '../src/inject/remote-config';

describe('forceAutocaptureOn', () => {
  it('enables autocapture flags without mutating the input', () => {
    const input = {
      configs: { analyticsSDK: { autocapture: { elementInteractions: false, pageViews: false } } },
    };
    const out = forceAutocaptureOn(input);
    expect(out.configs.analyticsSDK.autocapture.elementInteractions).toBe(true);
    expect(out.configs.analyticsSDK.autocapture.pageViews).toBe(true);
    expect(input.configs.analyticsSDK.autocapture.elementInteractions).toBe(false); // unchanged
  });
});
