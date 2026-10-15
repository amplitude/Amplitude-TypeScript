/* eslint-disable jest/expect-expect -- assertions live in assertParityResult(). */

import { resolveZoningFlags } from '../src/flags';

import { assertParityResult } from './assert-parity-result';
import { ZONING_PARITY_FIXTURES } from './fixtures/fixtures';
import { runCoreFixture } from './fixtures/run-core-fixture';

describe('zoning parity fixtures (@amplitude/zoning-core)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it.each(
    ZONING_PARITY_FIXTURES.map((fixture) => ({
      name: fixture.name,
      fixture,
    })),
  )('$name', ({ fixture }) => {
    document.body.innerHTML = fixture.html;
    fixture.setup?.(document);

    const result = runCoreFixture(fixture, document);
    assertParityResult(fixture, result);
  });

  it('F-D4d resolveZoningFlags requires sub-ff rollout for shadow', () => {
    expect(
      resolveZoningFlags({
        subFfRollout: false,
        shadowDom: true,
        cssMatchAggregation: true,
      }),
    ).toEqual({ cssMatchAggregation: true, shadowDom: false });

    expect(
      resolveZoningFlags({
        subFfRollout: true,
        shadowDom: true,
        cssMatchAggregation: false,
      }),
    ).toEqual({ cssMatchAggregation: false, shadowDom: true });
  });
});
