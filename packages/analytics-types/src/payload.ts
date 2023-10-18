import { Event } from './event';

export interface PayloadOptions {
  min_id_length?: number;
}

export interface Payload {
  api_key: string;
  events: readonly Event[];
  options?: PayloadOptions;
  client_upload_time?: string;
}
