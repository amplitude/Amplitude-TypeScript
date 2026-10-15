import { resolveZoningFlags } from '../src/flags';

describe('resolveZoningFlags', () => {
  it('combines rollout and shadowDom for effective shadow', () => {
    expect(
      resolveZoningFlags({
        subFfRollout: true,
        shadowDom: false,
        cssMatchAggregation: true,
      }),
    ).toEqual({ cssMatchAggregation: true, shadowDom: false });
  });
});
