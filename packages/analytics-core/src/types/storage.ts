import { IDiagnosticsClient } from '../diagnostics/diagnostics-client';

export interface Storage<T> {
  isEnabled(): Promise<boolean>;
  get(key: string): Promise<T | undefined>;
  getRaw(key: string): Promise<string | undefined>;
  set(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
  reset(): Promise<void>;
}

export interface CookieStorageOptions {
  domain?: string;
  expirationDays?: number;
  sameSite?: string;
  secure?: boolean;
}

/**
 * Configuration for CookieStorage behavior.
 * Separated from options to keep storage-specific config distinct from cookie attributes.
 */
export interface CookieStorageConfig {
  /**
   * Function to resolve duplicate cookies when multiple cookies with the same key exist.
   * Returns true if the cookie value should be used, false otherwise.
   */
  duplicateResolverFn?: (value: string) => boolean;
  diagnosticsClient?: IDiagnosticsClient;
}

export type IdentityStorageType = 'cookie' | 'localStorage' | 'sessionStorage' | 'none';
