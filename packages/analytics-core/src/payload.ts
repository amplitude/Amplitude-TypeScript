import { Event } from './event/event';
import { RequestMetadata } from './config';

export interface PayloadOptions {
  min_id_length?: number;
}

export interface Payload {
  api_key: string;
  events: readonly Event[];
  options?: PayloadOptions;
  client_upload_time?: string;
  request_metadata?: RequestMetadata;
}
