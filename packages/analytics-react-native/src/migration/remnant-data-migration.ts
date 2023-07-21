import { NativeModules } from 'react-native';
import { Event, Logger, Storage, UserSession } from '@amplitude/analytics-types';
import { STORAGE_PREFIX } from '@amplitude/analytics-core/src/constants';

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
    private logger: Logger | undefined,
  ) {
    this.eventsStorageKey = `${STORAGE_PREFIX}_${this.apiKey.substring(0, 10)}`;
    this.nativeModule = NativeModules.AmplitudeReactNative as AmplitudeReactNative | undefined;
  }

  async execute(): Promise<Omit<UserSession, 'optOut'>> {
    let lastEventId: number | undefined = undefined;
    if (this.firstRunSinceUpgrade) {
      const maxInterceptedIdentifyId = await this.moveInterceptedIdentifies();
      lastEventId = this.maxId(lastEventId, maxInterceptedIdentifyId);
      const maxIdentifyId = await this.moveIdentifies();
      lastEventId = this.maxId(lastEventId, maxIdentifyId);
    }
    const maxEventId = await this.moveEvents();
    lastEventId = this.maxId(lastEventId, maxEventId);

    const sessionData = await this.callNativeFunction(() => this.nativeModule?.getLegacySessionData(this.instanceName));
    return {
      lastEventId,
      ...sessionData,
    };
  }

  private async moveEvents(): Promise<number | undefined> {
    const legacyEvents = await this.callNativeFunction(() => this.nativeModule?.getLegacyEvents(this.instanceName));
    return await this.moveLegacyEvents(legacyEvents);
  }

  private async moveIdentifies(): Promise<number | undefined> {
    const legacyEvents = await this.callNativeFunction(() => this.nativeModule?.getLegacyIdentifies(this.instanceName));
    return await this.moveLegacyEvents(legacyEvents);
  }

  private async moveInterceptedIdentifies(): Promise<number | undefined> {
    const legacyEvents = await this.nativeModule?.getLegacyInterceptedIdentifies(this.instanceName);
    return await this.moveLegacyEvents(legacyEvents);
  }

  private async callNativeFunction<T>(action: (() => Promise<T> | undefined) | undefined): Promise<T | undefined> {
    if (action === undefined) {
      return undefined;
    }

    try {
      return await action();
    } catch (e) {
      this.logger?.error(`can't call native function: ${String(e)}`);
      return undefined;
    }
  }

  private async moveLegacyEvents(legacyJsonEvents: string[] | undefined): Promise<number | undefined> {
    if (!this.storage || !legacyJsonEvents || legacyJsonEvents.length === 0) {
      return undefined;
    }

    const events = (await this.storage.get(this.eventsStorageKey)) ?? [];

    let maxEventId: number | undefined;
    legacyJsonEvents.forEach((jsonEvent) => {
      const event = this.convertLegacyEvent(jsonEvent);
      if (event) {
        maxEventId = this.maxId(maxEventId, event.event_id);
        events.push(event);
      }
    });

    await this.storage.set(this.eventsStorageKey, events);
    return maxEventId;
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

  private maxId(id1: number | undefined, id2: number | undefined): number | undefined {
    if (id1 === undefined) {
      return id2;
    }
    if (id2 === undefined) {
      return id1;
    }
    return id2 > id1 ? id2 : id1;
  }
}
