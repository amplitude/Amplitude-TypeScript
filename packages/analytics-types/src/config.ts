import { Event } from './event';
import { Logger, LogLevel } from './logger';
import { Storage, UserSession } from './storage';
import { Transport } from './transport';

export interface Config {
  apiKey: string;
  userId?: string;
  deviceId?: string;
  sessionId?: number;
  flushIntervalMillis: number;
  flushMaxRetries: number;
  flushQueueSize: number;
  logLevel: LogLevel;
  logger: Logger;
  serverUrl: string;
  transportProvider: Transport;
  storageProvider: Storage<Event[]>;
}

export interface BrowserConfig extends Config {
  cookieExpiration: number;
  cookieSameSite: string;
  cookieSecure: boolean;
  cookieStorage: Storage<UserSession>;
  disableCookies: boolean;
  domain: string;
  sessionTimeout: number;
}

export type InitOptions<T extends Config> =
  | Partial<Config> &
      Omit<T, keyof Config> & {
        apiKey: string;
        transportProvider: Transport;
        storageProvider: Storage<Event[]>;
      };

export type BrowserOptions = Omit<Partial<BrowserConfig>, 'apiKey' | 'userId'>;
