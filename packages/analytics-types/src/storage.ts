import { Logger } from './logger';

export interface Storage<T> {
  isEnabled(): Promise<boolean>;
  get(key: string): Promise<T | undefined>;
  getRaw(key: string): Promise<string | undefined>;
  set(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
  reset(): Promise<void>;
  logger?: Logger;
}

export interface CookieStorageOptions {
  domain?: string;
  expirationDays?: number;
  sameSite?: string;
  secure?: boolean;
}

export type IdentityStorageType = 'cookie' | 'localStorage' | 'sessionStorage' | 'none';
