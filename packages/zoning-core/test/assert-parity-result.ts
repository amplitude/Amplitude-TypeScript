/* eslint-disable jest/no-conditional-expect -- data-driven parity fixtures assert only fields present on `expected`. */

import { getShadowDomHitTestOptions } from '../src/shadow';

import type { ZoningFixture } from './fixtures/types';

export const assertParityResult = (
  fixture: ZoningFixture,
  result: ReturnType<typeof import('./fixtures/run-core-fixture').runCoreFixture>,
): void => {
  const expected = fixture.expected;

  if (expected.allowedElementSelector) {
    expect(result.allowedElementSelector).toBe(expected.allowedElementSelector);
  }

  if (expected.parentQueries !== undefined) {
    expect(result.parentQueries).toEqual(expected.parentQueries);
  }

  if (expected.topLevelZoneIds) {
    expect(result.topLevelZoneIds).toEqual(expected.topLevelZoneIds);
  }

  if (expected.matchedValue !== undefined) {
    expect(result.matchedValue).not.toBeNull();
    expect(result.matchedValue as number).toBeCloseTo(expected.matchedValue as number, 10);
  }

  if (expected.eventCount !== undefined) {
    expect(result.eventCount).toBe(expected.eventCount);
  }

  if (expected.request) {
    expect(result.requestBody).toMatchObject(expected.request);
  }

  if (expected.requestEnabled !== undefined) {
    expect(result.requestEnabled).toBe(expected.requestEnabled);
  }

  if (fixture.name === 'F-CFG merge elementInteractions shadow fields') {
    const shadow = getShadowDomHitTestOptions(result.config);
    expect(shadow.shadowDomEnabled).toBe(true);
    expect(shadow.maxShadowDomDepth).toBe(3);
  }

  if (fixture.name === 'F-D1b engine disabled uses legacy css path') {
    expect(result.zoneId).toContain('div');
  }
};
