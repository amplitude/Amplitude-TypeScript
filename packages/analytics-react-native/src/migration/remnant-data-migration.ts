import { NativeModules } from 'react-native';
import { Event, Storage, UserSession } from '@amplitude/analytics-types';
import { STORAGE_PREFIX } from '@amplitude/analytics-core/src/constants';

export type LegacySessionData = {
  deviceId?: string;
  userId?: string;
  sessionId?: number;
  lastEventTime?: number;
  lastEventId?: number;
};

interface AmplitudeReactNative {
  getLegacySessionData(instanceName: string | undefined): Promise<Omit<UserSession, 'optOut'>>;
  getLegacyEvents(instanceName: string | undefined): Promise<string[]>;
  getLegacyIdentifies(instanceName: string | undefined): Promise<string[]>;
  getLegacyInterceptedIdentifies(instanceName: string | undefined): Promise<string[]>;
}

export default class RemnantDataMigration {
  eventsStorageKey: string;
  private nativeModule: AmplitudeReactNative | undefined;

  constructor(
    private apiKey: string,
    private instanceName: string | undefined,
    private storage: Storage<Event[]> | undefined,
    private firstRunSinceUpgrade: boolean,
  ) {
    this.eventsStorageKey = `${STORAGE_PREFIX}_${this.apiKey.substring(0, 10)}`;
    this.nativeModule = NativeModules.AmplitudeReactNative as AmplitudeReactNative | undefined;
  }

  async execute(): Promise<Omit<UserSession, 'optOut'>> {
    if (this.firstRunSinceUpgrade) {
      await this.moveInterceptedIdentifies();
      await this.moveIdentifies();
    }
    await this.moveEvents();

    const sessionData = await this.nativeModule?.getLegacySessionData(this.instanceName);
    return sessionData ?? {};
  }

  private async moveEvents() {
    const legacyEvents = await this.nativeModule?.getLegacyEvents(this.instanceName);
    await this.moveLegacyEvents(legacyEvents);
  }

  private async moveIdentifies() {
    const legacyEvents = await this.nativeModule?.getLegacyIdentifies(this.instanceName);
    await this.moveLegacyEvents(legacyEvents);
  }

  private async moveInterceptedIdentifies() {
    const legacyEvents = await this.nativeModule?.getLegacyInterceptedIdentifies(this.instanceName);
    await this.moveLegacyEvents(legacyEvents);
  }

  private async moveLegacyEvents(legacyJsonEvents: string[] | undefined) {
    if (!this.storage || !legacyJsonEvents || legacyJsonEvents.length === 0) {
      return;
    }

    const events = (await this.storage.get(this.eventsStorageKey)) ?? [];

    legacyJsonEvents.forEach((jsonEvent) => {
      const event = this.convertLegacyEvent(jsonEvent);
      if (event) {
        events.push(event);
      }
    });

    await this.storage.set(this.eventsStorageKey, events);
  }

  /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
  private convertLegacyEvent(legacyJsonEvent: string): Event | null {
    try {
      const event = JSON.parse(legacyJsonEvent) as Event;

      const { library, timestamp, uuid, api_properties } = event as any;
      if (library !== undefined) {
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        event.library = `${library.name}/${library.version}`;
      }
      if (timestamp !== undefined) {
        event.time = timestamp;
      }
      if (uuid !== undefined) {
        event.insert_id = uuid;
      }

      if (api_properties) {
        const { androidADID, android_app_set_id, ios_idfa, ios_idfv, productId, quantity, price, location } =
          api_properties;
        if (androidADID !== undefined) {
          event.adid = androidADID;
        }
        if (android_app_set_id !== undefined) {
          event.android_app_set_id = android_app_set_id;
        }
        if (ios_idfa !== undefined) {
          event.idfa = ios_idfa;
        }
        if (ios_idfv !== undefined) {
          event.idfv = ios_idfv;
        }
        if (productId !== undefined) {
          event.productId = productId;
        }
        if (quantity !== undefined) {
          event.quantity = quantity;
        }
        if (price !== undefined) {
          event.price = price;
        }
        if (location !== undefined) {
          const { lat, lng } = location;
          event.location_lat = lat;
          event.location_lng = lng;
        }
      }

      const { $productId: productId, $quantity: quantity, $price: price, $revenueType: revenueType } = event as any;
      if (productId !== undefined) {
        event.productId = productId;
      }
      if (quantity !== undefined) {
        event.quantity = quantity;
      }
      if (price !== undefined) {
        event.price = price;
      }
      if (revenueType !== undefined) {
        event.revenueType = revenueType;
      }

      return event;
    } catch {
      // skip invalid events
      return null;
    }
  }
  // eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
}
