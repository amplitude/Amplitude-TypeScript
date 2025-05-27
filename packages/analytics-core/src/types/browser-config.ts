import { UserSession } from './user-session';
import { IdentityStorageType, Storage } from './storage';
import { Transport } from './transport';
import { IConfig } from '../config';
import { ElementInteractionsOptions } from './element-interactions';
import { PageTrackingOptions } from './page-view-tracking';
import { NetworkTrackingOptions } from './network-tracking';

export interface BrowserConfig extends ExternalBrowserConfig, InternalBrowserConfig {}

export interface ExternalBrowserConfig extends IConfig {
  /**
   * An app version for events tracked. This can be the version of your application.
   * @defaultValue `undefined`
   */
  appVersion?: string;
  /**
   * @deprecated This property is deprecated and will be removed in future versions. Please migrate to using `autocapture` instead.
   * The default event tracking configuration.
   * See {@link https://www.docs.developers.amplitude.com/data/sdks/browser-2/#tracking-default-events}.
   * @defaultValue `true`
   */
  defaultTracking?: boolean | DefaultTrackingOptions;
  /**
   * The configurations for auto-captured events.
   * See {@link https://www.docs.developers.amplitude.com/data/sdks/browser-2/autocapture/}.
   */
  autocapture?: boolean | AutocaptureOptions;
  /**
   * The identifier for the device running your application.
   * @defaultValue `UUID()`
   */
  deviceId?: string;
  /**
   * Configuration for cookie.
   */
  cookieOptions?: CookieOptions;
  /**
   * The storage for user identify.
   * @defaultValue `"cookie"`
   */
  identityStorage?: IdentityStorageType;
  /**
   * The partner identifier.
   * Amplitude requires the customer who built an event ingestion integration to add the partner identifier to partner_id.
   * @defaultValue `undefined`
   */
  partnerId?: string;
  /**
   * The custom Session ID for the current session.
   * @defaultValue `timestamp`
   */
  sessionId?: number;
  /**
   * The period of inactivity from the last tracked event before a session expires in milliseconds.
   * @defaultValue `1,800,000` (30 minutes)
   */
  sessionTimeout: number;
  /**
   * The configurations for tracking additional properties.
   * See {@link https://www.docs.developers.amplitude.com/data/sdks/browser-2/#optional-tracking}.
   */
  trackingOptions: TrackingOptions;
  /**
   * Network transport mechanism used to send events.
   * @defaultValue `"fetch"`
   */
  transport?: 'fetch' | 'xhr' | 'beacon';
  /**
   * The identifier for the user being tracked.
   * @defaultValue `undefined`
   */
  userId?: string;
  /**
   * User's Nth instance of performing a default Page Viewed event within a session.
   * Used for landing page analysis.
   */
  pageCounter?: number;
  /**
   * Whether to fetch remote configuration. The remote configuration can be updated in the Amplitude platform here:
   * https://app.amplitude.com/data/amplitude/{your_org_name}/settings/autocapture
   * @defaultValue `true`
   */
  fetchRemoteConfig?: boolean;
  /**
   * Captures network requests and responses.
   * @defaultValue `undefined`
   * @deprecated use autocapture.networkTracking instead
   */
  networkTrackingOptions?: NetworkTrackingOptions;
}

interface InternalBrowserConfig {
  cookieStorage: Storage<UserSession>;
  lastEventTime?: number;
  lastEventId?: number;
  transportProvider: Transport;
  version?: string;
}

/**
 * @deprecated This interface is deprecated and will be removed in future versions. Please migrate to using `AutocaptureOptions` instead.
 */
export interface DefaultTrackingOptions {
  /**
   * Enables/disables marketing attribution tracking or config with detailed attribution options.
   * @defaultValue `true`
   */
  attribution?: boolean | AttributionOptions;
  /**
   * Enables/disables form downloads tracking.
   * @defaultValue `true`
   */
  fileDownloads?: boolean;
  /**
   * Enables/disables form interaction tracking.
   * @defaultValue `true`
   */
  formInteractions?: boolean;
  /**
   * Enables/disables default page view tracking.
   * @defaultValue `true`
   */
  pageViews?: boolean | PageTrackingOptions;
  /**
   * Enables/disables session tracking.
   * @defaultValue `true`
   */
  sessions?: boolean;
}

export interface AutocaptureOptions {
  /**
   * Enables/disables marketing attribution tracking or config with detailed attribution options.
   * @defaultValue `true`
   */
  attribution?: boolean | AttributionOptions;
  /**
   * Enables/disables form downloads tracking.
   * @defaultValue `true`
   */
  fileDownloads?: boolean;
  /**
   * Enables/disables form interaction tracking.
   * @defaultValue `true`
   */
  formInteractions?: boolean;
  /**
   * Enables/disables default page view tracking.
   * @defaultValue `true`
   */
  pageViews?: boolean | PageTrackingOptions;
  /**
   * Enables/disables session tracking.
   * @defaultValue `true`
   */
  sessions?: boolean;
  /**
   * Enables/disables user interactions tracking.
   * @defaultValue `false`
   */
  elementInteractions?: boolean | ElementInteractionsOptions;
  /**
   * Enables/disables network request tracking or config with detailed network tracking options.
   * @defaultValue `false`
   */
  networkTracking?: boolean | NetworkTrackingOptions;
}

export interface TrackingOptions {
  /**
   * Enables/disables ip address tracking.
   * @defaultValue `true`
   */
  ipAddress?: boolean;
  /**
   * Enables/disables language tracking.
   * @defaultValue `true`
   */
  language?: boolean;
  /**
   * Enables/disables plantform tracking.
   * @defaultValue `true`
   */
  platform?: boolean;
}

export interface AttributionOptions {
  /**
   * The rules to determine which referrers are excluded from being tracked as traffic source.
   * @defaultValue `[/your-domain\.com$/]`
   */
  excludeReferrers?: (string | RegExp)[];
  /**
   * The value to represent undefined/no initial campaign parameter for first-touch attribution.
   * @defaultValue `"EMPTY"`
   */
  initialEmptyValue?: string;
  /**
   * The flag of if Amplitude to start a new session if any campaign parameter changes.
   * @defaultValue `false`
   */
  resetSessionOnNewCampaign?: boolean;
}

export interface CookieOptions {
  /**
   * The domain property of cookies created.
   * @defaultValue `Your top level domain`
   */
  domain?: string;
  /**
   * The expiration of cookies created in days.
   * @defaultValue `365`
   */
  expiration?: number;
  /**
   * How cookies are sent with cross-site requests.
   * @defaultValue `"Lax"`
   */
  sameSite?: 'Strict' | 'Lax' | 'None';
  /**
   * The flag of if send cookies over secure protocols.
   * @defaultValue `false`
   */
  secure?: boolean;
  /**
   * The flag of if upgrade the cookies created by maintenance Browser SDK.
   * @defaultValue `true`
   */
  upgrade?: boolean;
}

type HiddenOptions = 'apiKey' | 'transportProvider' | 'requestMetadata';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface BrowserOptions extends Omit<Partial<ExternalBrowserConfig>, HiddenOptions> {}
