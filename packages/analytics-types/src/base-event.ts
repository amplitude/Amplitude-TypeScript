import { Plan } from './plan';

export interface BaseEvent extends EventOptions {
  event_type: string;
  event_properties?: { [key: string]: any };
  user_properties?: { [key: string]: any };
  groups?: { [key: string]: any };
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
  uuid?: string;
  price?: number;
  quantity?: number;
  revenue?: number;
  productId?: string;
  revenueType?: string;
  event_id?: number;
  session_id?: number;
  insert_id?: string;
  plan?: Plan;
}
