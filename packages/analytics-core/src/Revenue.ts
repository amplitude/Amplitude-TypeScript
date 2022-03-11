import { RevenueProperty, RevenueEventProperties, Revenue as IRevenue } from '@amplitude/analytics-types';
import { isValidObject } from './utils/valid-properties';

export class Revenue implements IRevenue {
  protected _productId: string;
  protected _quantity: number;
  protected _price: number;
  protected _revenueType?: string;
  protected _receiptSig?: string;
  protected _receipt?: string;
  protected _properties?: { [key: string]: any };
  protected _revenue?: number;

  constructor() {
    this._productId = '';
    this._quantity = 1;
    this._price = 0.0;
  }

  setProductId(productId: string) {
    this._productId = productId;
    return this;
  }
  setQuantity(quantity: number) {
    if (quantity > 0) {
      this._quantity = quantity;
    }
    return this;
  }
  setPrice(price: number) {
    this._price = price;
    return this;
  }
  setRevenueType(revenueType: string) {
    this._revenueType = revenueType;
    return this;
  }

  setReceipt(receipt: string, receiptSig: string) {
    this._receipt = receipt;
    this._receiptSig = receiptSig;
    return this;
  }

  setRevenue(revenue: number) {
    this._revenue = revenue;
    return this;
  }

  setEventProperties(properties: { [key: string]: any }) {
    if (isValidObject(properties)) {
      this._properties = properties;
    }
    return this;
  }

  getEventProperties(): RevenueEventProperties {
    const eventProperties: RevenueEventProperties = this._properties ? { ...this._properties } : {};
    eventProperties[RevenueProperty.REVENUE_PRODUCT_ID] = this._productId;
    eventProperties[RevenueProperty.REVENUE_QUANTITY] = this._quantity;
    eventProperties[RevenueProperty.REVENUE_PRICE] = this._price;
    eventProperties[RevenueProperty.REVENUE_TYPE] = this._revenueType;
    eventProperties[RevenueProperty.REVENUE_RECEIPT] = this._receipt;
    eventProperties[RevenueProperty.REVENUE_RECEIPT_SIG] = this._receiptSig;
    eventProperties[RevenueProperty.REVENUE] = this._revenue;
    return eventProperties;
  }
}
