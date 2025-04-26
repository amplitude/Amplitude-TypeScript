/* eslint-disable @typescript-eslint/unbound-method */
import client from './browser-client-factory';
export { createInstance } from './browser-client-factory';
export const {
  add,
  extendSession,
  flush,
  getDeviceId,
  getSessionId,
  getUserId,
  groupIdentify,
  identify,
  init,
  logEvent,
  remove,
  reset,
  revenue,
  setDeviceId,
  setGroup,
  setOptOut,
  setSessionId,
  setTransport,
  setUserId,
  track,
} = client;
export { AmplitudeBrowser } from './browser-client';
export { runQueuedFunctions } from './utils/snippet-helper';
export { Revenue, Identify } from '@amplitude/analytics-core';

import {
  AmplitudeReturn as AmplitudeReturnType,
  BaseEvent as BaseEventType,
  EventOptions as EventOptionsType,
  BrowserClient as BrowserClientType,
  AttributionOptions as AttributionOptionsType,
  AutocaptureOptions as AutocaptureOptionsType,
  BrowserOptions as BrowserOptionsType,
  BrowserConfig as BrowserConfigType,
  IConfig as IConfigType,
  Event as EventType,
  IdentifyEvent as IdentifyEventType,
  GroupIdentifyEvent as GroupIdentifyEventType,
  IdentifyOperation as IdentifyOperationType,
  SpecialEventType as SpecialEventTypeType,
  IIdentify as IIdentifyType,
  IRevenue as IRevenueType,
  RevenueProperty as RevenuePropertyType,
  ILogger as ILoggerType,
  LogLevel as LogLevelType,
  Plugin as PluginType,
  BeforePlugin as BeforePluginType,
  EnrichmentPlugin as EnrichmentPluginType,
  DestinationPlugin as DestinationPluginType,
  Result as ResultType,
  ServerZoneType as ServerZoneTypeType,
  ServerZone as ServerZoneEnum,
  IdentityStorageType as IdentityStorageTypeType,
  Storage as StorageTypeType,
  TransportType as TransportTypeType,
  OfflineDisabled as OfflineDisabledType,
  Messenger as MessengerType,
  ElementInteractionsOptions as ElementInteractionsOptionsType,
  ActionType as ActionTypeType,
  DEFAULT_CSS_SELECTOR_ALLOWLIST as DEFAULT_CSS_SELECTOR_ALLOWLIST_TYPE,
  DEFAULT_DATA_ATTRIBUTE_PREFIX as DEFAULT_DATA_ATTRIBUTE_PREFIX_TYPE,
  DEFAULT_ACTION_CLICK_ALLOWLIST as DEFAULT_ACTION_CLICK_ALLOWLIST_TYPE,
} from '@amplitude/analytics-core';

import {
  Campaign as CampaignType,
  CampaignParser as CampaignParserType,
  ClickIdParameters as ClickIdParametersType,
  ReferrerParameters as ReferrerParametersType,
  UTMParameters as UTMParametersType,
} from './attribution/campaign';

// Export the following types to maintain backward compatibility with `analytics-types`.
// In the next major version, only export customer-facing types to reduce the public API surface.
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Types {
  export type AmplitudeReturn<T> = AmplitudeReturnType<T>;
  export type BaseEvent = BaseEventType;
  export type EventOptions = EventOptionsType;
  export type Campaign = CampaignType;
  export type CampaignParser = CampaignParserType;
  export type ClickIdParameters = ClickIdParametersType;
  export type ReferrerParameters = ReferrerParametersType;
  export type UTMParameters = UTMParametersType;
  export type BrowserClient = BrowserClientType;
  export type AttributionOptions = AttributionOptionsType;
  export type AutocaptureOptions = AutocaptureOptionsType;
  export type BrowserConfig = BrowserConfigType;
  export type BrowserOptions = BrowserOptionsType;
  export type Config = IConfigType;
  export type Event = EventType;
  export type IdentifyEvent = IdentifyEventType;
  export type GroupIdentifyEvent = GroupIdentifyEventType;
  export type IdentifyOperation = IdentifyOperationType;
  export type SpecialEventType = SpecialEventTypeType;
  export type Identify = IIdentifyType;
  export type Revenue = IRevenueType;
  export const RevenueProperty = RevenuePropertyType;
  export type Logger = ILoggerType;
  export const LogLevel = LogLevelType;
  export type Plugin = PluginType;
  export type BeforePlugin = BeforePluginType;
  export type EnrichmentPlugin = EnrichmentPluginType;
  export type DestinationPlugin = DestinationPluginType;
  export type Result = ResultType;
  export type ServerZoneType = ServerZoneTypeType;
  export const ServerZone = ServerZoneEnum;
  export type IdentityStorageType = IdentityStorageTypeType;
  export type Storage<T> = StorageTypeType<T>;
  export type TransportType = TransportTypeType;
  export const OfflineDisabled = OfflineDisabledType;
  export type Messenger = MessengerType;
  export type ElementInteractionsOptions = ElementInteractionsOptionsType;
  export type ActionType = ActionTypeType;
  export const DEFAULT_CSS_SELECTOR_ALLOWLIST = DEFAULT_CSS_SELECTOR_ALLOWLIST_TYPE;
  export const DEFAULT_DATA_ATTRIBUTE_PREFIX = DEFAULT_DATA_ATTRIBUTE_PREFIX_TYPE;
  export const DEFAULT_ACTION_CLICK_ALLOWLIST = DEFAULT_ACTION_CLICK_ALLOWLIST_TYPE;
}
