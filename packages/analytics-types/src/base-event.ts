import { Plan } from './plan';

/**
 * Amplitude event definition.
 */
export interface BaseEvent {
  // Required
  event_type: string;
  // Semi required
  user_id?: string;
  device_id?: string;

  // Optional
  time?: number;
  location_lat?: number;
  location_lng?: number;

  app_version?: string;
  version_name?: string;
  library?: string;

  /** Optional
   * Warning: updating any one of the following seven fields will reset the other fields
   * to null on the backend, unless the other fields are also set.
   * See https://developers.amplitude.com/docs/http-api-v2 (Footnote 2) for more info
   */
  platform?: string;
  os_name?: string;
  os_version?: string;
  device_brand?: string;
  device_manufacturer?: string;
  device_model?: string;
  carrier?: string;

  /** Optional
   * Warning: updating any one of the following four fields will reset the other fields
   * to null on the backend, unless the other fields are also set.
   * See https://developers.amplitude.com/docs/http-api-v2 (Footnote 3) for more info
   */
  country?: string;
  region?: string;
  city?: string;
  dma?: string; // ** The current Designated Market Area of the user. */

  idfa?: string;
  idfv?: string;
  adid?: string;
  android_id?: string;

  language?: string;
  ip?: string;
  uuid?: string;
  event_properties?: { [key: string]: any };
  user_properties?: { [key: string]: any };

  price?: number;
  quantity?: number;
  revenue?: number;
  productId?: string;
  revenueType?: string;

  event_id?: number;
  session_id?: number;
  insert_id?: string;

  groups?: { [key: string]: any };
  plan?: Plan;
}
