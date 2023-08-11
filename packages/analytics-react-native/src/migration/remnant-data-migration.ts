import { NativeModules } from 'react-native';
import { Event, Logger, Storage, UserSession } from '@amplitude/analytics-types';
import { STORAGE_PREFIX } from '@amplitude/analytics-core';

type LegacyEventKind = 'event' | 'identify' | 'interceptedIdentify';

interface AmplitudeReactNative {
  getLegacySessionData(instanceName: string | undefined): Promise<Omit<UserSession, 'optOut'>>;
  getLegacyEvents(instanceName: string | undefined, eventKind: LegacyEventKind): Promise<string[]>;
  removeLegacyEvent(instanceName: string | undefined, eventKind: LegacyEventKind, eventId: number): void;
}

export default class RemnantDataMigration {
  eventsStorageKey: string;
  private readonly nativeModule: AmplitudeReactNative;

  constructor(
    private apiKey: string,
    private instanceName: string | undefined,
    private storage: Storage<Event[]> | undefined,
    private firstRunSinceUpgrade: boolean,
    private logger: Logger | undefined,
  ) {
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    this.eventsStorageKey = `${STORAGE_PREFIX}_${this.apiKey.substring(0, 10)}`;
    this.nativeModule = NativeModules.AmplitudeReactNative as AmplitudeReactNative;
  }

  async execute(): Promise<Omit<UserSession, 'optOut'>> {
    if (!this.nativeModule) {
      return {};
    }

    if (this.firstRunSinceUpgrade) {
      await this.moveIdentifies();
      await this.moveInterceptedIdentifies();
    }
    await this.moveEvents();

    const sessionData = await this.callNativeFunction(() => this.nativeModule.getLegacySessionData(this.instanceName));
    return sessionData ?? {};
  }

  private async moveEvents() {
    await this.moveLegacyEvents('event');
  }

  private async moveIdentifies() {
    await this.moveLegacyEvents('identify');
  }

  private async moveInterceptedIdentifies() {
    await this.moveLegacyEvents('interceptedIdentify');
  }

  private async callNativeFunction<T>(action: () => Promise<T>): Promise<T | undefined> {
    try {
      return await action();
    } catch (e) {
      this.logger?.error(`can't call native function: ${String(e)}`);
      return undefined;
    }
  }

  private callNativeAction(action: () => void) {
    try {
      action();
    } catch (e) {
      this.logger?.error(`can't call native function: ${String(e)}`);
    }
  }

  private async moveLegacyEvents(eventKind: LegacyEventKind) {
    const legacyJsonEvents = await this.callNativeFunction(() =>
      this.nativeModule.getLegacyEvents(this.instanceName, eventKind),
    );
    if (!this.storage || !legacyJsonEvents || legacyJsonEvents.length === 0) {
      return;
    }

    const events = (await this.storage.get(this.eventsStorageKey)) ?? [];
    const eventIds: number[] = [];

    legacyJsonEvents.forEach((jsonEvent) => {
      const event = this.convertLegacyEvent(jsonEvent);
      if (event) {
        events.push(event);
        if (event.event_id !== undefined) {
          eventIds.push(event.event_id);
        }
      }
    });

    await this.storage.set(this.eventsStorageKey, events);
    eventIds.forEach((eventId) =>
      this.callNativeAction(() => this.nativeModule.removeLegacyEvent(this.instanceName, eventKind, eventId)),
    );
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
