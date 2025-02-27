import {
  RevenueProperty,
  RevenueEventProperties,
  Revenue as IRevenue,
  ValidPropertyType,
} from '@amplitude/analytics-types';
import { isValidObject } from './utils/valid-properties';

export class Revenue implements IRevenue {
  private productId: string;
  private quantity: number;
  private price: number;
  private revenueType?: string;
  private currency?: string;
  private properties?: { [key: string]: any };
  private revenue?: number;

  constructor() {
    this.productId = '';
    this.quantity = 1;
    this.price = 0.0;
  }

  setProductId(productId: string) {
    this.productId = productId;
    return this;
  }

  setQuantity(quantity: number) {
    if (quantity > 0) {
      this.quantity = quantity;
    }
    return this;
  }

  setPrice(price: number) {
    this.price = price;
    return this;
  }

  setRevenueType(revenueType: string) {
    this.revenueType = revenueType;
    return this;
  }

  setCurrency(currency: string) {
    this.currency = currency;
    return this;
  }

  setRevenue(revenue: number) {
    this.revenue = revenue;
    return this;
  }

  setEventProperties(properties: { [key: string]: ValidPropertyType }) {
    if (isValidObject(properties)) {
      this.properties = properties;
    }
    return this;
  }

  getEventProperties(): RevenueEventProperties {
    const eventProperties: RevenueEventProperties = this.properties ? { ...this.properties } : {};
    eventProperties[RevenueProperty.REVENUE_PRODUCT_ID] = this.productId;
    eventProperties[RevenueProperty.REVENUE_QUANTITY] = this.quantity;
    eventProperties[RevenueProperty.REVENUE_PRICE] = this.price;
    eventProperties[RevenueProperty.REVENUE_TYPE] = this.revenueType;
    eventProperties[RevenueProperty.REVENUE_CURRENCY] = this.currency;
    eventProperties[RevenueProperty.REVENUE] = this.revenue;
    return eventProperties;
  }
}
