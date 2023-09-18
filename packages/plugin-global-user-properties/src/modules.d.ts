// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { TrackEvent, IdentifyEvent } from '@amplitude/analytics-types';

declare module '@amplitude/analytics-types' {
  export interface TrackEvent {
    global_user_properties?: { [key: string]: any } | undefined;
  }

  export interface IdentifyEvent {
    global_user_properties?: { [key: string]: any } | undefined;
  }
}
