export interface Storage {
  isEnabled(): boolean;
  get(key: string): any;
  set(key: string, value: any): void;
  remove(key: string): void;
  reset(): void;
}

export interface CookieStorageOptions {
  domain?: string;
  expirationDays?: number;
  sameSite?: string;
  secure?: boolean;
}
