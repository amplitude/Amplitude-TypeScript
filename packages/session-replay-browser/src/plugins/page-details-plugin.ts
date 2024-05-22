import { EventType, IncrementalSource, MouseInteractions } from '@amplitude/rrweb';
import { RecordPlugin, eventWithTime, PointerTypes, MediaInteractions, CanvasContext } from '@amplitude/rrweb-types';

// This may not be the exhaustive list, if adding here implementation
// may be needed in the plugin.
type eventType =
  | {
      type: Exclude<EventType, EventType.IncrementalSnapshot | EventType.Plugin>;
    }
  | {
      type: EventType.IncrementalSnapshot;
      source:
        | {
            id: IncrementalSource.MouseInteraction;
            type: MouseInteractions;
            pointerType?: PointerTypes;
          }
        | {
            id: IncrementalSource.MediaInteraction;
            type: MediaInteractions;
          }
        | {
            id: IncrementalSource.CanvasMutation;
            type: CanvasContext;
          }
        | {
            id: Exclude<
              IncrementalSource,
              IncrementalSource.MouseInteraction | IncrementalSource.MediaInteraction | IncrementalSource.CanvasMutation
            >;
          };
    };

type PageDetailsPluginOptions = {
  eventTypes: eventType[];
};
export type pageDetails = {
  pageDetails: {
    pageUrl: string;
  };
};

type eventWithTimeAndPageDetails = eventWithTime & pageDetails;

export const PageDetailsPlugin: (options: PageDetailsPluginOptions) => RecordPlugin = (options) => {
  const eventMatchesEventType = (event: eventWithTime, eventType: eventType): boolean => {
    if (event.type === EventType.IncrementalSnapshot && eventType.type === EventType.IncrementalSnapshot) {
      switch (eventType.source.id) {
        case IncrementalSource.MouseInteraction:
          if (event.data.source === IncrementalSource.MouseInteraction && event.data.type === eventType.source.type) {
            return !eventType.source.pointerType || event.data.pointerType === eventType.source.pointerType;
          }
          return event.data.source === eventType.source.id && event.data.type === eventType.source.type;
        case (IncrementalSource.MediaInteraction, IncrementalSource.CanvasMutation):
          return event.data.source === eventType.source.id && event.data.type === eventType.source.type;
        default:
          return event.data.source === eventType.source.id;
      }
    } else {
      // types are equal
      return eventType.type !== event.type;
    }
  };

  const eventMatchesAnyEventType = (event: eventWithTime): boolean => {
    for (const eventType of options.eventTypes) {
      if (eventMatchesEventType(event, eventType)) {
        return true;
      }
    }

    return false;
  };

  return {
    name: '@amplitude/click@1',
    options,
    eventProcessor: <pageDetails>(event: eventWithTime): eventWithTime & pageDetails => {
      if (!eventMatchesAnyEventType(event)) {
        return event;
      }

      const augmentedEvent: eventWithTimeAndPageDetails = {
        ...event,
        pageDetails: {
          // eslint-disable-next-line no-restricted-globals
          pageUrl: window.location.href.split('?')[0],
        },
      };
      return augmentedEvent;
    },
  };
};
