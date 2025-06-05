/* eslint-disable no-restricted-globals */
import {
  BrowserClient,
  BrowserConfig,
  EnrichmentPlugin,
  NetworkRequestEvent,
  networkObserver,
  NetworkEventCallback,
  NetworkTrackingOptions,
  ILogger,
} from '@amplitude/analytics-core';
import * as constants from './constants';
import { Observable, Subscription } from 'rxjs';
import { HasEventTargetAddRemove } from 'rxjs/internal/observable/fromEvent';
import { trackNetworkEvents } from './track-network-event';

declare global {
  interface Window {
    navigation: HasEventTargetAddRemove<Event>;
  }
}

export type BrowserEnrichmentPlugin = EnrichmentPlugin<BrowserClient, BrowserConfig>;

export enum ObservablesEnum {
  NetworkObservable = 'networkObservable',
}

// Base TimestampedEvent type
type BaseTimestampedEvent<T> = {
  event: T;
  timestamp: number;
  type: 'rage' | 'click' | 'change' | 'error' | 'navigate' | 'mutation' | 'network';
};

// Specific types for events with targetElementProperties
export type ElementBasedEvent = MouseEvent | Event;
export type ElementBasedTimestampedEvent<T> = BaseTimestampedEvent<T> & {
  event: MouseEvent | Event;
  type: 'click' | 'change';
  closestTrackedAncestor: Element;
  targetElementProperties: Record<string, any>;
};

// Union type for all possible TimestampedEvents
export type TimestampedEvent<T> = BaseTimestampedEvent<T> | ElementBasedTimestampedEvent<T>;

export interface AllWindowObservables {
  [ObservablesEnum.NetworkObservable]: Observable<TimestampedEvent<NetworkRequestEvent>>;
}

export const networkCapturePlugin = (options: NetworkTrackingOptions = {}): BrowserEnrichmentPlugin => {
  const name = constants.PLUGIN_NAME;
  const type = 'enrichment';
  let logger: ILogger;

  const subscriptions: Subscription[] = [];

  const addAdditionalEventProperties = <T>(
    event: T,
    type: TimestampedEvent<T>['type'],
  ): TimestampedEvent<T> | ElementBasedTimestampedEvent<T> => {
    const baseEvent: BaseTimestampedEvent<T> | ElementBasedTimestampedEvent<T> = {
      event,
      timestamp: Date.now(),
      type,
    };

    return baseEvent;
  };

  // Create observables on events on the window
  const createObservables = (): AllWindowObservables => {
    const networkObservable = new Observable<TimestampedEvent<NetworkRequestEvent>>((observer) => {
      const callback = new NetworkEventCallback((event) => {
        const eventWithProperties = addAdditionalEventProperties(event, 'network');
        observer.next(eventWithProperties);
      });
      networkObserver.subscribe(callback, logger);
      return () => {
        networkObserver.unsubscribe(callback);
      };
    });

    return {
      [ObservablesEnum.NetworkObservable]: networkObservable,
    };
  };

  const setup: BrowserEnrichmentPlugin['setup'] = async (config, amplitude) => {
    /* istanbul ignore if */
    if (typeof document === 'undefined') {
      return;
    }

    // Create observables for events on the window
    const allObservables = createObservables();

    const networkRequestSubscription = trackNetworkEvents({
      allObservables,
      networkTrackingOptions: options,
      amplitude,
    });
    subscriptions.push(networkRequestSubscription);

    /* istanbul ignore next */
    logger = config?.loggerProvider;
    /* istanbul ignore next */
    logger?.log(`${name} has been successfully added.`);
  };

  /* istanbul ignore next */
  const execute: BrowserEnrichmentPlugin['execute'] = async (event) => {
    return event;
  };

  const teardown = async () => {
    for (const subscription of subscriptions) {
      subscription.unsubscribe();
    }
  };

  return {
    name,
    type,
    setup,
    execute,
    teardown,
  };
};
