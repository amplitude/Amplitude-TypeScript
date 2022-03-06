import { Transport } from './transport';

export interface Config {
  apiKey: string;
  userId?: string;
  flushIntervalMillis: number;
  flushMaxRetries: number;
  flushQueueSize: number;
  serverUrl: string;
  transportProvider: Transport;
}

export interface BrowserConfig extends Config {
  disableCookies: boolean;
}

export type InitOptions<T extends Config> =
  | Omit<Partial<Config>, 'apiKey' | 'userId'> &
      Omit<T, keyof Config> & {
        transportProvider: Transport;
      };
