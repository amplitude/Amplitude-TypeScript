import {
  Config,
  Logger,
  ILogger,
  LogLevel,
  Event,
  Storage,
  IngestionMetadata,
  ServerZoneType,
  OfflineDisabled,
  Plan,
  IdentityStorageType,
  TransportTypeOrOptions,
  MemoryStorage,
  UUID,
  CookieStorage,
  getCookieName,
  FetchTransport,
  getQueryParams,
  UserSession,
  BrowserOptions,
  BrowserConfig as IBrowserConfig,
  DefaultTrackingOptions,
  TrackingOptions,
  AutocaptureOptions,
  CookieOptions,
  RemoteConfigOptions,
  NetworkTrackingOptions,
  IIdentify,
  IDiagnosticsClient,
  isDomainEqual,
  CookieStorageConfig,
  decodeCookieValue,
} from '@amplitude/analytics-core';

import { LocalStorage } from './storage/local-storage';
import { SessionStorage } from './storage/session-storage';
import { XHRTransport } from './transports/xhr';
import { SendBeaconTransport } from './transports/send-beacon';
import { parseLegacyCookies } from './cookie-migration';
import { DEFAULT_IDENTITY_STORAGE, DEFAULT_SERVER_ZONE } from './constants';
import { AmplitudeBrowser } from './browser-client';
import { VERSION } from './version';

// Exported for testing purposes only. Do not expose to public interface.
export class BrowserConfig extends Config implements IBrowserConfig {
  public readonly version = VERSION;
  protected _cookieStorage: Storage<UserSession>;
  protected _deviceId?: string;
  protected _lastEventId?: number;
  protected _lastEventTime?: number;
  protected _optOut = false;
  protected _sessionId?: number;
  protected _userId?: string;
  protected _pageCounter?: number;
  protected _debugLogsEnabled?: boolean;
  constructor(
    public apiKey: string,
    public appVersion?: string,
    cookieStorage: Storage<UserSession> = new MemoryStorage(),
    public cookieOptions: CookieOptions = {
      domain: '',
      expiration: 365,
      sameSite: 'Lax' as const,
      secure: false,
      upgrade: true,
    },
    public defaultTracking?: boolean | DefaultTrackingOptions,
    public autocapture?: boolean | AutocaptureOptions,
    deviceId?: string,
    public flushIntervalMillis: number = 1000,
    public flushMaxRetries: number = 5,
    public flushQueueSize: number = 30,
    public identityStorage: IdentityStorageType = DEFAULT_IDENTITY_STORAGE,
    public ingestionMetadata?: IngestionMetadata,
    public instanceName?: string,
    lastEventId?: number,
    lastEventTime?: number,
    public loggerProvider: ILogger = new Logger(),
    public logLevel: LogLevel = LogLevel.Warn,
    public minIdLength?: number,
    public offline: boolean | typeof OfflineDisabled = false,
    optOut = false,
    public partnerId?: string,
    public plan?: Plan,
    public serverUrl: string = '',
    public serverZone: ServerZoneType = DEFAULT_SERVER_ZONE,
    sessionId?: number,
    public sessionTimeout: number = 30 * 60 * 1000,
    public storageProvider: Storage<Event[]> = new LocalStorage({ loggerProvider }),
    public trackingOptions: Required<TrackingOptions> = {
      ipAddress: true,
      language: true,
      platform: true,
    },
    public transport: TransportTypeOrOptions = 'fetch',
    public useBatch: boolean = false,
    public fetchRemoteConfig: boolean = true,
    userId?: string,
    pageCounter?: number,
    debugLogsEnabled?: boolean,
    public networkTrackingOptions?: NetworkTrackingOptions,
    public identify?: IIdentify,
    public enableDiagnostics: boolean = true,
    public diagnosticsSampleRate: number = 0,
    public diagnosticsClient?: IDiagnosticsClient,
    public remoteConfig?: RemoteConfigOptions,
  ) {
    super({ apiKey, storageProvider, transportProvider: createTransport(transport) });
    this._cookieStorage = cookieStorage;
    this.deviceId = deviceId;
    this.lastEventId = lastEventId;
    this.lastEventTime = lastEventTime;
    this.optOut = optOut;
    this.sessionId = sessionId;
    this.pageCounter = pageCounter;
    this.userId = userId;
    this.debugLogsEnabled = debugLogsEnabled;
    this.loggerProvider.enable(debugLogsEnabled ? LogLevel.Debug : this.logLevel);
    this.networkTrackingOptions = networkTrackingOptions;
    this.identify = identify;
    this.enableDiagnostics = enableDiagnostics;
    this.diagnosticsSampleRate = diagnosticsSampleRate;
    this.diagnosticsClient = diagnosticsClient;

    // Note: The canonical logic for determining fetchRemoteConfig is in shouldFetchRemoteConfig().
    // This logic is duplicated here to maintain the BrowserConfig constructor contract and ensure
    // the config object has the correct fetchRemoteConfig value set on its properties.
    // The value passed to this constructor should already be computed via shouldFetchRemoteConfig().
    const _fetchRemoteConfig = remoteConfig?.fetchRemoteConfig ?? fetchRemoteConfig;
    this.remoteConfig = this.remoteConfig || {};
    this.remoteConfig.fetchRemoteConfig = _fetchRemoteConfig;
    this.fetchRemoteConfig = _fetchRemoteConfig;
  }

  get cookieStorage() {
    return this._cookieStorage;
  }

  set cookieStorage(cookieStorage: Storage<UserSession>) {
    if (this._cookieStorage !== cookieStorage) {
      this._cookieStorage = cookieStorage;
      this.updateStorage();
    }
  }

  get deviceId() {
    return this._deviceId;
  }

  set deviceId(deviceId: string | undefined) {
    if (this._deviceId !== deviceId) {
      this._deviceId = deviceId;
      this.updateStorage();
    }
  }

  get userId() {
    return this._userId;
  }

  set userId(userId: string | undefined) {
    if (this._userId !== userId) {
      this._userId = userId;
      this.updateStorage();
    }
  }

  get sessionId() {
    return this._sessionId;
  }

  set sessionId(sessionId: number | undefined) {
    if (this._sessionId !== sessionId) {
      this._sessionId = sessionId;
      this.updateStorage();
    }
  }

  get optOut() {
    return this._optOut;
  }

  set optOut(optOut: boolean) {
    if (this._optOut !== optOut) {
      this._optOut = optOut;
      this.updateStorage();
    }
  }

  get lastEventTime() {
    return this._lastEventTime;
  }

  set lastEventTime(lastEventTime: number | undefined) {
    if (this._lastEventTime !== lastEventTime) {
      this._lastEventTime = lastEventTime;
      this.updateStorage();
    }
  }

  get lastEventId() {
    return this._lastEventId;
  }

  set lastEventId(lastEventId: number | undefined) {
    if (this._lastEventId !== lastEventId) {
      this._lastEventId = lastEventId;
      this.updateStorage();
    }
  }

  get pageCounter() {
    return this._pageCounter;
  }

  set pageCounter(pageCounter: number | undefined) {
    if (this._pageCounter !== pageCounter) {
      this._pageCounter = pageCounter;
      this.updateStorage();
    }
  }

  set debugLogsEnabled(debugLogsEnabled: boolean | undefined) {
    if (this._debugLogsEnabled !== debugLogsEnabled) {
      this._debugLogsEnabled = debugLogsEnabled;
      this.updateStorage();
    }
  }

  private updateStorage() {
    const cache = {
      deviceId: this._deviceId,
      userId: this._userId,
      sessionId: this._sessionId,
      optOut: this._optOut,
      lastEventTime: this._lastEventTime,
      lastEventId: this._lastEventId,
      pageCounter: this._pageCounter,
      debugLogsEnabled: this._debugLogsEnabled,
      cookieDomain: undefined as string | undefined,
    };

    if (this.cookieStorage instanceof CookieStorage) {
      cache.cookieDomain = this.cookieStorage.options.domain;
    }

    void this.cookieStorage.set(getCookieName(this.apiKey), cache);
  }
}

/**
 * Early-initialized configuration values that are determined before useBrowserConfig is called.
 * These are created early to support DiagnosticsClient and RemoteConfigClient initialization.
 */
export interface EarlyConfig {
  /** Logger instance - shared across DiagnosticsClient, RemoteConfigClient, and BrowserConfig */
  loggerProvider: ILogger;
  /** Server zone for API endpoints */
  serverZone: ServerZoneType;
  /** Whether diagnostics is enabled (may come from remote config) */
  enableDiagnostics: boolean;
  /** Diagnostics sample rate (may come from remote config) */
  diagnosticsSampleRate: number;
}

export const useBrowserConfig = async (
  apiKey: string,
  options: BrowserOptions = {},
  amplitudeInstance: AmplitudeBrowser,
  diagnosticsClient?: IDiagnosticsClient,
  earlyConfig?: EarlyConfig,
): Promise<IBrowserConfig> => {
  // Step 1: Create identity storage instance
  const identityStorage = options.identityStorage || DEFAULT_IDENTITY_STORAGE;
  const cookieOptions = {
    domain:
      identityStorage !== DEFAULT_IDENTITY_STORAGE ? '' : options.cookieOptions?.domain ?? (await getTopLevelDomain()),
    expiration: 365,
    sameSite: 'Lax' as const,
    secure: false,
    upgrade: true,
    ...options.cookieOptions,
  };

  const cookieConfig: CookieStorageConfig = {
    // if more than one cookie with the same key exists,
    // look for the cookie that has the domain attribute set to cookieOptions.domain
    duplicateResolverFn: (value: string): boolean => {
      const decodedValue = decodeCookieValue(value);
      if (!decodedValue) {
        return false;
      }
      const parsed = JSON.parse(decodedValue) as UserSession;
      return isDomainEqual(parsed.cookieDomain, cookieOptions.domain);
    },
    diagnosticsClient: diagnosticsClient,
  };
  const cookieStorage = createCookieStorage<UserSession>(options.identityStorage, cookieOptions, cookieConfig);

  // Step 1: Parse cookies using identity storage instance
  const legacyCookies = await parseLegacyCookies(apiKey, cookieStorage, options.cookieOptions?.upgrade ?? true);
  const previousCookies = await cookieStorage.get(getCookieName(apiKey));
  const queryParams = getQueryParams();

  // Check if ampTimestamp is present and valid
  const ampTimestamp = queryParams.ampTimestamp ? Number(queryParams.ampTimestamp) : undefined;
  const isWithinTimeLimit = ampTimestamp ? Date.now() < ampTimestamp : true;

  // Step 3: Reconcile user identity
  const deviceId =
    options.deviceId ??
    (isWithinTimeLimit ? queryParams.ampDeviceId ?? queryParams.deviceId : undefined) ??
    previousCookies?.deviceId ??
    legacyCookies.deviceId ??
    UUID();
  const lastEventId = previousCookies?.lastEventId ?? legacyCookies.lastEventId;
  const lastEventTime = previousCookies?.lastEventTime ?? legacyCookies.lastEventTime;
  const optOut = options.optOut ?? previousCookies?.optOut ?? legacyCookies.optOut;
  const sessionId = previousCookies?.sessionId ?? legacyCookies.sessionId;
  const userId = options.userId ?? previousCookies?.userId ?? legacyCookies.userId;
  amplitudeInstance.previousSessionDeviceId = previousCookies?.deviceId ?? legacyCookies.deviceId;
  amplitudeInstance.previousSessionUserId = previousCookies?.userId ?? legacyCookies.userId;

  const trackingOptions = {
    ipAddress: options.trackingOptions?.ipAddress ?? true,
    language: options.trackingOptions?.language ?? true,
    platform: options.trackingOptions?.platform ?? true,
  };
  const pageCounter = previousCookies?.pageCounter;
  const debugLogsEnabled = previousCookies?.debugLogsEnabled;

  // Override default tracking options if autocapture is set
  if (options.autocapture !== undefined) {
    options.defaultTracking = options.autocapture;
  }

  const browserConfig = new BrowserConfig(
    apiKey,
    options.appVersion,
    cookieStorage,
    cookieOptions,
    options.defaultTracking,
    options.autocapture,
    deviceId,
    options.flushIntervalMillis,
    options.flushMaxRetries,
    options.flushQueueSize,
    identityStorage,
    options.ingestionMetadata,
    options.instanceName,
    lastEventId,
    lastEventTime,
    // Use earlyConfig.loggerProvider to ensure consistent logger across DiagnosticsClient/RemoteConfigClient/BrowserConfig
    earlyConfig?.loggerProvider ?? options.loggerProvider,
    options.logLevel,
    options.minIdLength,
    options.offline,
    optOut,
    options.partnerId,
    options.plan,
    options.serverUrl,
    // Use earlyConfig.serverZone to ensure consistent serverZone
    earlyConfig?.serverZone ?? options.serverZone,
    sessionId,
    options.sessionTimeout,
    options.storageProvider,
    trackingOptions,
    options.transport,
    options.useBatch,
    options.fetchRemoteConfig,
    userId,
    pageCounter,
    debugLogsEnabled,
    options.networkTrackingOptions,
    options.identify,
    // Use earlyConfig values (already has remote config applied), otherwise fall back to options
    earlyConfig?.enableDiagnostics ?? options.enableDiagnostics,
    earlyConfig?.diagnosticsSampleRate ?? amplitudeInstance._diagnosticsSampleRate,
    diagnosticsClient,
    options.remoteConfig,
  );

  if (!(await browserConfig.storageProvider.isEnabled())) {
    browserConfig.loggerProvider.warn(
      `Storage provider ${browserConfig.storageProvider.constructor.name} is not enabled. Falling back to MemoryStorage.`,
    );
    browserConfig.storageProvider = new MemoryStorage();
  }

  return browserConfig;
};

export const createCookieStorage = <T>(
  identityStorage: IdentityStorageType = DEFAULT_IDENTITY_STORAGE,
  cookieOptions: CookieOptions = {},
  cookieConfig?: CookieStorageConfig,
) => {
  switch (identityStorage) {
    case 'localStorage':
      return new LocalStorage<T>();
    case 'sessionStorage':
      return new SessionStorage<T>();
    case 'none':
      return new MemoryStorage<T>();
    case 'cookie':
    default:
      return new CookieStorage<T>(
        {
          ...cookieOptions,
          expirationDays: cookieOptions.expiration,
        },
        cookieConfig,
      );
  }
};

/**
 * Determines whether to fetch remote config based on options.
 * Extracted to allow early determination before useBrowserConfig is called.
 */
export const shouldFetchRemoteConfig = (options: BrowserOptions = {}): boolean => {
  if (options.remoteConfig?.fetchRemoteConfig === true) {
    // set to true if remoteConfig explicitly set to true
    return true;
  } else if (options.remoteConfig?.fetchRemoteConfig === false || options.fetchRemoteConfig === false) {
    // set to false if either are set to false explicitly
    return false;
  } else {
    // default to true if both undefined
    return true;
  }
};

export const createTransport = (transport?: TransportTypeOrOptions) => {
  const type = typeof transport === 'object' ? transport.type : transport;
  const headers = typeof transport === 'object' ? transport.headers : undefined;

  if (type === 'xhr') {
    return new XHRTransport(headers);
  }
  if (type === 'beacon') {
    // SendBeacon does not support custom headers
    return new SendBeaconTransport();
  }
  return new FetchTransport(headers);
};

export const getTopLevelDomain = async (url?: string) => {
  if (
    !(await new CookieStorage<number>().isEnabled()) ||
    (!url && (typeof location === 'undefined' || !location.hostname))
  ) {
    return '';
  }

  const host = url ?? location.hostname;
  const parts = host.split('.');
  const levels = [];
  const cookieKeyUniqueId = UUID();
  const storageKey = `AMP_TLDTEST_${cookieKeyUniqueId.substring(0, 8)}`;

  for (let i = parts.length - 2; i >= 0; --i) {
    levels.push(parts.slice(i).join('.'));
  }
  for (let i = 0; i < levels.length; i++) {
    const domain = levels[i];
    const options = {
      domain: '.' + domain,
      expirationDays: 0.003, // expire in ~5 minutes
    };
    const storage = new CookieStorage<number>(options);
    await storage.set(storageKey, 1);
    const value = await storage.get(storageKey);
    if (value) {
      await storage.remove(storageKey);
      return '.' + domain;
    }
  }

  return '';
};
