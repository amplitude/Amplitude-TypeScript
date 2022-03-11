import { Event } from './event';
import { Storage, UserSession } from './storage';
import { Transport } from './transport';

export interface Config {
  apiKey: string;
  userId?: string;
  flushIntervalMillis: number;
  flushMaxRetries: number;
  flushQueueSize: number;
  serverUrl: string;
  transportProvider: Transport;
  storageProvider: Storage<Event[]>;
}

export interface BrowserConfig extends Config {
  cookieStorage: Storage<UserSession>;
  cookieExpiration: number;
  cookieSameSite: string;
  cookieSecure: boolean;
  disableCookies: boolean;
  domain: string;
}

export type InitOptions<T extends Config> =
  | Omit<Partial<Config>, 'apiKey' | 'userId'> &
      Omit<T, keyof Config> & {
        transportProvider: Transport;
        storageProvider: Storage<Event[]>;
      };
