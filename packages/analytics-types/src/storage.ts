export interface Storage<T> {
  isEnabled(): boolean;
  get(key: string): T | undefined;
  getRaw(key: string): string | undefined;
  set(key: string, value: T): void;
  remove(key: string): void;
  reset(): void;
}

export interface CookieStorageOptions {
  domain?: string;
  expirationDays?: number;
  sameSite?: string;
  secure?: boolean;
}
