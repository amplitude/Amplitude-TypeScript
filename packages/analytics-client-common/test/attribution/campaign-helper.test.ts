import { Identify } from '@amplitude/analytics-core';
import { isCampaignEvent } from '../../src/attribution/campaign-helper';
import { BASE_CAMPAIGN } from '../../src/attribution/constants';

describe('isCampaignEvent', () => {
  test('should return false with undefined user props', () => {
    expect(
      isCampaignEvent({
        event_type: 'event_type',
      }),
    ).toBe(false);
  });

  test('should return false with empty user props', () => {
    expect(
      isCampaignEvent({
        event_type: 'event_type',
        user_properties: {},
      }),
    ).toBe(false);
  });

  test('should return true', () => {
    const identifyEvent = Object.entries(BASE_CAMPAIGN).reduce((identify, [key, value]) => {
      if (value) {
        return identify.set(key, value);
      }
      return identify.unset(key);
    }, new Identify());

    expect(
      isCampaignEvent({
        event_type: 'event_type',
        user_properties: identifyEvent.getUserProperties(),
      }),
    ).toBe(true);
  });
});
