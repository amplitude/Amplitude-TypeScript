import { createRevenueEvent } from '../src/utils/event-builder';
import { Revenue } from '../src/index';
import { RevenueProperty } from '@amplitude/analytics-types';

const defaultRevenueProperty = {
  [RevenueProperty.REVENUE_PRODUCT_ID]: '',
  [RevenueProperty.REVENUE_QUANTITY]: 1,
  [RevenueProperty.REVENUE_PRICE]: 0,
};
describe('Revenue class', () => {
  test('setProjectId', () => {
    const productId = 'testProductId';
    const revenue = new Revenue();
    revenue.setProductId(productId);
    const event = createRevenueEvent(revenue);

    const expectedProperties = { ...defaultRevenueProperty, [RevenueProperty.REVENUE_PRODUCT_ID]: productId };

    expect(event.event_properties).toEqual(expectedProperties);
  });

  test('Set invalid quantity', () => {
    const invalidQuantity = -1;
    const revenue = new Revenue();
    revenue.setQuantity(invalidQuantity);
    const event = createRevenueEvent(revenue);

    const expectedProperties = { ...defaultRevenueProperty, [RevenueProperty.REVENUE_QUANTITY]: 1 };

    expect(event.event_properties).toEqual(expectedProperties);
  });

  test('Set valid quantity', () => {
    const validQuantity = 10;
    const revenue = new Revenue();
    revenue.setQuantity(validQuantity);
    const event = createRevenueEvent(revenue);

    const expectedProperties = { ...defaultRevenueProperty, [RevenueProperty.REVENUE_QUANTITY]: validQuantity };

    expect(event.event_properties).toEqual(expectedProperties);
  });

  test('setPrice', () => {
    const price = 10;
    const revenue = new Revenue();
    revenue.setPrice(price);
    const event = createRevenueEvent(revenue);

    const expectedProperties = {
      ...defaultRevenueProperty,
      [RevenueProperty.REVENUE_PRICE]: price,
    };

    expect(event.event_properties).toEqual(expectedProperties);
  });

  test('setRevenueType', () => {
    const revenueType = 'testRevenueType';
    const revenue = new Revenue();
    revenue.setRevenueType(revenueType);
    revenue.setCurrency('USD');
    const event = createRevenueEvent(revenue);

    const expectedProperties = {
      ...defaultRevenueProperty,
      [RevenueProperty.REVENUE_TYPE]: revenueType,
      [RevenueProperty.REVENUE_CURRENCY]: 'USD',
    };

    expect(event.event_properties).toEqual(expectedProperties);
  });

  test('setRevenue', () => {
    const revenueAmount = 100;
    const revenue = new Revenue();
    revenue.setRevenue(revenueAmount);
    const event = createRevenueEvent(revenue);

    const expectedProperties = { ...defaultRevenueProperty, [RevenueProperty.REVENUE]: revenueAmount };

    expect(event.event_properties).toEqual(expectedProperties);
  });

  test('setEventProperties', () => {
    const property = { testStringKey: 'string value', testBooleanKey: true };
    const revenue = new Revenue();
    revenue.setEventProperties(property);
    const event = createRevenueEvent(revenue);

    const expectedProperties = { ...defaultRevenueProperty, ...property };

    expect(event.event_properties).toEqual(expectedProperties);
  });
});
