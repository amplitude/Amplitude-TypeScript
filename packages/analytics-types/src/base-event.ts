import { Plan } from './plan';
import { IngestionMetadataEventProperty } from './ingestion-metadata';

export interface BaseEvent extends EventOptions {
  event_type: string;
  event_properties?: { [key: string]: any } | undefined;
  user_properties?: { [key: string]: any } | undefined;
  group_properties?: { [key: string]: any } | undefined;
  groups?: { [key: string]: any } | undefined;
}

export interface EventOptions {
  user_id?: string;
  device_id?: string;
  time?: number;
  location_lat?: number;
  location_lng?: number;
  app_version?: string;
  version_name?: string;
  library?: string;
  platform?: string;
  os_name?: string;
  os_version?: string;
  device_brand?: string;
  device_manufacturer?: string;
  device_model?: string;
  carrier?: string;
  country?: string;
  region?: string;
  city?: string;
  dma?: string;
  idfa?: string;
  idfv?: string;
  adid?: string;
  android_id?: string;
  language?: string;
  ip?: string;
  price?: number;
  quantity?: number;
  revenue?: number;
  productId?: string;
  revenueType?: string;
  event_id?: number;
  session_id?: number;
  insert_id?: string;
  plan?: Plan;
  ingestion_metadata?: IngestionMetadataEventProperty;
  partner_id?: string;
  extra?: { [key: string]: any };
}
