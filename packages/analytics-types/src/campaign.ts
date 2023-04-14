import { BaseEvent } from './base-event';
import { AttributionOptions } from './config';
import { Storage } from './storage';

export interface UTMParameters {
  utm_campaign: string | undefined;
  utm_content: string | undefined;
  utm_id: string | undefined;
  utm_medium: string | undefined;
  utm_source: string | undefined;
  utm_term: string | undefined;
}

export interface ReferrerParameters {
  referrer: string | undefined;
  referring_domain: string | undefined;
}

export interface ClickIdParameters {
  dclid: string | undefined;
  fbclid: string | undefined;
  gbraid: string | undefined;
  gclid: string | undefined;
  ko_click_id: string | undefined;
  msclkid: string | undefined;
  rtd_cid: string | undefined;
  ttclid: string | undefined;
  twclid: string | undefined;
  wbraid: string | undefined;
}

export interface Campaign
  extends Record<string, string | undefined>,
    UTMParameters,
    ReferrerParameters,
    ClickIdParameters {}

export interface CampaignParser {
  parse(): Promise<Campaign>;
}

export interface CampaignTrackerOptions extends AttributionOptions {
  storage: Storage<Campaign>;
  track: CampaignTrackFunction;
  onNewCampaign: (campaign: Campaign) => unknown;
}

export interface CampaignTracker extends CampaignTrackerOptions {
  send(force: boolean): Promise<void>;
}

export type CampaignTrackFunction = (event: BaseEvent) => Promise<unknown>;
