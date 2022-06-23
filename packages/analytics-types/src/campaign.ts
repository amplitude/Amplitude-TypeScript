import { BaseEvent } from './base-event';
import { AttributionBrowserOptions } from './config';
import { Storage } from './storage';

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

export interface CampaignTrackerOptions extends AttributionBrowserOptions {
  storage: Storage<Campaign>;
  track: CampaignTrackFunction;
  onNewCampaign: (campaign: Campaign) => unknown;
}

export interface CampaignTracker extends CampaignTrackerOptions {
  send(force: boolean): Promise<void>;
}

export type CampaignTrackFunction = (event: BaseEvent) => Promise<unknown>;
