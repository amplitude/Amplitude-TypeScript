import { BaseEvent } from './base-event';

export interface UTMParameters extends Record<string, string | undefined> {
  utm_source: string | undefined;
  utm_medium: string | undefined;
  utm_campaign: string | undefined;
  utm_term: string | undefined;
  utm_content: string | undefined;
}

export interface ReferrerParameters extends Record<string, string | undefined> {
  referrer: string | undefined;
  referring_domain: string | undefined;
}

export interface ClickIdParameters extends Record<string, string | undefined> {
  gclid: string | undefined;
  fbclid: string | undefined;
}

export interface Campaign extends UTMParameters, ReferrerParameters, ClickIdParameters {}

export interface CampaignParser {
  parse(): Campaign;
}

export interface CampaignTrackerOptions {
  apiKey: string;
  tracker?: CampaignTrackerFunction;
  excludeReferrers?: string[];
  initialEmptyValue?: string;
  onNewCampaign?: (campaign: Campaign) => unknown;
}

export interface CampaignTracker {
  onNewCampaign?: (campaign: Campaign) => unknown;
  isNewCampaign(prev: Campaign, current: Campaign): boolean;
  trackCampaign(): Promise<void>;
}

export type CampaignTrackerFunction = (event: BaseEvent) => Promise<unknown>;
