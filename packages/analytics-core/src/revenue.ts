import { isValidObject } from './utils/valid-properties';

export interface IRevenue {
  getEventProperties(): RevenueEventProperties;
  setProductId(productId: string): IRevenue;
  setQuantity(quantity: number): IRevenue;
  setPrice(price: number): IRevenue;
  setRevenueType(revenueType: string): IRevenue;
  setCurrency(currency: string): IRevenue;
  setEventProperties(properties: { [key: string]: any }): IRevenue;
  setRevenue(revenue: number): IRevenue;
  setReceipt(receipt: string): IRevenue;
  setReceiptSig(receiptSig: string): IRevenue;
}

export class Revenue implements IRevenue {
  private productId: string;
  private quantity: number;
  private price: number;
  private revenueType?: string;
  private currency?: string;
  private properties?: { [key: string]: any };
  private revenue?: number;
  private receipt?: string;
  private receiptSig?: string;

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

  setReceipt(receipt: string) {
    this.receipt = receipt;
    return this;
  }

  setReceiptSig(receiptSig: string) {
    this.receiptSig = receiptSig;
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
    eventProperties[RevenueProperty.RECEIPT] = this.receipt;
    eventProperties[RevenueProperty.RECEIPT_SIG] = this.receiptSig;
    return eventProperties;
  }
}

export interface RevenueEventProperties {
  [RevenueProperty.REVENUE_PRODUCT_ID]?: string;
  [RevenueProperty.REVENUE_QUANTITY]?: number;
  [RevenueProperty.REVENUE_PRICE]?: number;
  [RevenueProperty.REVENUE_TYPE]?: string;
  [RevenueProperty.REVENUE_CURRENCY]?: string;
  [RevenueProperty.REVENUE]?: number;
  [RevenueProperty.RECEIPT]?: string;
  [RevenueProperty.RECEIPT_SIG]?: string;
}

export enum RevenueProperty {
  REVENUE_PRODUCT_ID = '$productId',
  REVENUE_QUANTITY = '$quantity',
  REVENUE_PRICE = '$price',
  REVENUE_TYPE = '$revenueType',
  REVENUE_CURRENCY = '$currency',
  REVENUE = '$revenue',
  RECEIPT = '$receipt',
  RECEIPT_SIG = '$receiptSig',
}

export type ValidPropertyType =
  | number
  | string
  | boolean
  | Array<string | number>
  | { [key: string]: ValidPropertyType }
  | Array<{ [key: string]: ValidPropertyType }>;
