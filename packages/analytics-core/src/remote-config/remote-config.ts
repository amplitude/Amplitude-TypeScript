import { ServerZoneType } from '../types/server-zone';
import { ILogger } from '../logger';
import { RemoteConfigIdbStorage } from './remote-config-idb-storage';
import { UUID } from '../utils/uuid';

/**
 * Modes for receiving remote config updates:
 * - `'all'` – Receive all config updates as they occur.
 * - `{ timeout: number }` – Wait for a remote response until the specified timeout (in milliseconds),
 *   then return a cached copy if available.
 */
export type DeliveryMode = 'all' | { timeout: number };

/**
 * Sources of returned remote config:
 * - `cache` - Fetched from local storage.
 * - `remote` - Fetched from remote.
 */
export type Source = 'cache' | 'remote';

const US_SERVER_URL = 'https://sr-client-cfg.amplitude.com/config';
const EU_SERVER_URL = 'https://sr-client-cfg.eu.amplitude.com/config';
const DEFAULT_MAX_RETRIES = 3;
// TODO(xinyi)
// const DEFAULT_MIN_TIME_BETWEEN_FETCHES = 5 * 60 * 1000; // 5 minutes
const FETCHED_KEYS = [
  'analyticsSDK.browserSDK',
  'sessionReplay.sr_interaction_config',
  'sessionReplay.sr_logging_config',
  'sessionReplay.sr_privacy_config',
  'sessionReplay.sr_sampling_config',
  'sessionReplay.sr_targeting_config',
];

interface RemoteConfig {
  [key: string]: any;
}

export interface RemoteConfigInfo {
  remoteConfig: RemoteConfig | null;
  // Timestamp of when the remote config was fetched.
  lastFetch: Date;
}

export interface RemoteConfigStorage {
  /**
   * Fetch remote config from storage asynchronously.
   */
  //
  fetchConfig(): Promise<RemoteConfigInfo>;
  /**
   * Set remote config to storage asynchronously.
   * @param config
   */
  setConfig(config: RemoteConfigInfo): Promise<boolean>;
}

/**
 * Information about each callback registered by `RemoteConfigClient.subscribe()`,
 * managed internally by `RemoteConfigClient`.
 */
interface CallbackInfo {
  id: string;
  key?: string;
  deliveryMode: DeliveryMode;
  callback: RemoteConfigCallback;
  lastCallback?: Date;
}

/**
 * Callback used in `RemoteConfigClient.subscribe()`.
 * This function is called when the remote config is fetched.
 */
type RemoteConfigCallback = (remoteConfig: RemoteConfig | null, source: Source, lastFetch: Date) => void;

export class RemoteConfigClient {
  private readonly apiKey: string;
  private readonly serverUrl: string;
  private readonly logger: ILogger;
  private readonly storage: RemoteConfigStorage;

  // Registered callbackInfos by subscribe().
  private callbackInfos: CallbackInfo[] = [];

  constructor(apiKey: string, logger: ILogger, serverZone: ServerZoneType = 'US') {
    this.apiKey = apiKey;
    this.serverUrl = serverZone === 'US' ? US_SERVER_URL : EU_SERVER_URL;
    this.logger = logger;
    this.storage = new RemoteConfigIdbStorage(apiKey);
  }

  /**
   * Subscribe for updates to remote config.
   * Callback is guaranteed to be called at least once,
   * Whether we are able to fetch a config or not.
   *
   * @param key - a string containing a series of period delimited keys to filter the returned config.
   * Ie, {a: {b: {c: ...}}} would return {b: {c: ...}} for "a" or {c: ...} for "a.b".
   * Set to `undefined` to subscribe all keys.
   * @param deliveryMode - how the initial callback is sent.
   * @param callback - a block that will be called when remote config is fetched.
   * @return id - identification of the subscribe and can be used to unsubscribe from updates.
   */
  subscribe(key: string | undefined, deliveryMode: DeliveryMode = 'all', callback: RemoteConfigCallback): string {
    const id = UUID();
    const callbackInfo = {
      id: id,
      key: key,
      deliveryMode: deliveryMode,
      callback: callback,
    };
    this.callbackInfos.push(callbackInfo);

    if (deliveryMode === 'all') {
      void this.subscribeAll(callbackInfo);
    } else {
      void this.subscribeWaitForRemote(callbackInfo, deliveryMode.timeout);
    }

    return id;
  }

  /**
   * Unsubscribe a callback from receiving future updates.
   *
   * @param id - identification of the callback that you want to unsubscribe.
   * It's the return value of subscribe().
   */
  unsubscribe(id: string) {
    const index = this.callbackInfos.findIndex((callbackInfo) => callbackInfo.id === id);
    if (index === -1) {
      this.logger.debug(`Remote config client unsubscribe failed because callback with id ${id} doesn't exist.`);
      return;
    }

    this.callbackInfos.splice(index, 1);
    this.logger.debug(`Remote config client unsubscribe succeeded removing callback with id ${id}.`);
  }

  /**
   * Request the remote config client to fetch from remote, update cache, and callback.
   */
  updateConfigs() {
    void this.fetch().then((result) => {
      void this.storage.setConfig(result);
      this.callbackInfos.forEach((callbackInfo) => {
        this.sendCallback(callbackInfo, result, 'remote');
      });
    });
  }

  /**
   * Send remote first. If it's already complete, we can skip the cached response.
   * - if remote is fetched first, no cache fetch.
   * - if cache is fetched first, still fetching remote.
   * @param callbackInfo
   * @private
   */
  private async subscribeAll(callbackInfo: CallbackInfo) {
    const remotePromise = this.fetch().then((result) => {
      this.logger.debug('Remote config client subscription all mode fetched from remote.');
      this.sendCallback(callbackInfo, result, 'remote');
      void this.storage.setConfig(result);
    });

    const cachePromise = this.storage.fetchConfig().then((result) => {
      return result;
    });

    // Wait for the first result to resolve
    const result = await Promise.race([remotePromise, cachePromise]);

    // If cache is fetched first, wait for remote.
    if (result !== undefined) {
      this.logger.debug('Remote config client subscription all mode fetched from cache.');
      this.sendCallback(callbackInfo, result, 'cache');
    }
    await remotePromise;
  }

  /**
   * Waits for a remote response until the given timeout, then return a cached copy, if available.
   * @param callbackInfo
   * @param timeout
   * @private
   */
  private async subscribeWaitForRemote(callbackInfo: CallbackInfo, timeout: number) {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject('Timeout exceeded');
      }, timeout);
    });

    try {
      const result: RemoteConfigInfo = (await Promise.race([this.fetch(), timeoutPromise])) as RemoteConfigInfo;

      this.logger.debug('Remote config client subscription wait for remote mode returns from remote.');
      this.sendCallback(callbackInfo, result, 'remote');
      void this.storage.setConfig(result);
    } catch (error) {
      this.logger.debug(
        'Remote config client subscription wait for remote mode exceeded timeout. Try to fetch from cache.',
      );
      const result = await this.storage.fetchConfig();
      if (result.remoteConfig !== null) {
        this.logger.debug('Remote config client subscription wait for remote mode returns a cached copy.');
        this.sendCallback(callbackInfo, result, 'cache');
      } else {
        this.logger.debug('Remote config client subscription wait for remote mode failed to fetch cache.');
        this.sendCallback(callbackInfo, { remoteConfig: null, lastFetch: new Date() }, 'remote');
      }
    }
  }

  /**
   * Call the callback with filtered remote config based on key.
   * @param callbackInfo
   * @param remoteConfigInfo - the whole remote config object without filtering by key.
   * @param source
   * @private
   */
  private sendCallback(callbackInfo: CallbackInfo, remoteConfigInfo: RemoteConfigInfo, source: Source) {
    callbackInfo.lastCallback = new Date();

    let filteredConfig: RemoteConfig | null;
    if (callbackInfo.key) {
      // Filter remote config by key.
      // For example, if remote config is {a: {b: {c: 1}}},
      // if key = 'a', filter result is {b: {c: 1}};
      // if key = 'a.b', filter result is {c: 1}
      filteredConfig = callbackInfo.key.split('.').reduce((config, key) => {
        return config ? config : ([key] as RemoteConfig);
      }, remoteConfigInfo.remoteConfig);
    } else {
      filteredConfig = remoteConfigInfo.remoteConfig;
    }

    callbackInfo.callback(filteredConfig, source, remoteConfigInfo.lastFetch);
  }

  private async fetch(retries: number = DEFAULT_MAX_RETRIES): Promise<RemoteConfigInfo> {
    const failedRemoteConfigInfo: RemoteConfigInfo = {
      remoteConfig: null,
      lastFetch: new Date(),
    };

    try {
      const res = await fetch(this.getUrlParams(), {
        method: 'GET',
        headers: {
          Accept: '*/*',
        },
      });

      // Handle unsuccessful fetch
      if (!res.ok) {
        const body = await res.text();
        this.logger.debug(`Remote config client fetch with retry time ${retries} failed with ${res.status}: ${body}`);
        if (retries > 1) {
          return this.fetch(retries--);
        }
        return failedRemoteConfigInfo;
      }

      // Handle successful fetch
      const remoteConfig: RemoteConfig = (await res.json()) as RemoteConfig;
      return {
        remoteConfig: remoteConfig,
        lastFetch: new Date(),
      };
    } catch (error) {
      // Handle rejects when the request fails, for example, a network error
      this.logger.debug(`Remote config client fetch with retry time ${retries} is rejected because: `, error);
      if (retries > 1) {
        return this.fetch(retries--);
      }
      return failedRemoteConfigInfo;
    }
  }

  private getUrlParams(): string {
    const urlParams = new URLSearchParams({
      api_key: this.apiKey,
    });
    FETCHED_KEYS.forEach((key) => {
      urlParams.append('config_keys', key);
    });

    return `${this.serverUrl}?${urlParams.toString()}`;
  }
}
