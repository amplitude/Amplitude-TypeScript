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
  parse(): Promise<Campaign>;
}

export interface CampaignTrackerOptions extends AttributionBrowserOptions {
  storage: Storage<Campaign>;
  track: CampaignTrackFunction;
  onNewCampaign: (campaign: Campaign) => unknown;
}

export interface CampaignTracker extends CampaignTrackerOptions {
  isNewCampaign(currentCampaign: Campaign, previousCampaign: Campaign): boolean;
  saveCampaignToStorage(campaign: Campaign): Promise<void>;
  getCampaignFromStorage(): Promise<Campaign>;
  createCampaignEvent(campaign: Campaign): BaseEvent;
  send(force: boolean): Promise<void>;
  onPageChange?: (
    callback: (state: { isNewCampaign: boolean; currentCampaign: Campaign }) => Promise<unknown>,
  ) => Promise<void>;
}

export type CampaignTrackFunction = (event: BaseEvent) => Promise<unknown>;
