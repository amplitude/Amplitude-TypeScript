import { EventType, IncrementalSource } from '@amplitude/rrweb-types';
import type { eventWithTime, mutationData } from '@amplitude/rrweb-types';

function isMergeableMutation(event: eventWithTime): boolean {
  if (event.type !== EventType.IncrementalSnapshot) return false;
  const data = event.data as mutationData;
  return data.source === IncrementalSource.Mutation && !data.isAttachIframe;
}

function mergeGroup(events: eventWithTime[]): eventWithTime {
  const first = events[0];
  const merged: mutationData = {
    source: IncrementalSource.Mutation,
    removes: events.flatMap((e) => (e.data as mutationData).removes),
    adds: events.flatMap((e) => (e.data as mutationData).adds),
    texts: events.flatMap((e) => (e.data as mutationData).texts),
    attributes: events.flatMap((e) => (e.data as mutationData).attributes),
  };
  return { ...first, data: merged } as eventWithTime;
}

/**
 * Merges consecutive IncrementalSnapshot mutation events into a single event,
 * reducing overall event count without changing replay semantics.
 *
 * isAttachIframe events are never merged — they carry a full iframe document
 * tree and must remain isolated.
 */
export function mergeMutationEvents(events: eventWithTime[]): eventWithTime[] {
  if (events.length <= 1) return events;

  const result: eventWithTime[] = [];
  let i = 0;

  while (i < events.length) {
    if (!isMergeableMutation(events[i])) {
      result.push(events[i]);
      i++;
      continue;
    }

    let j = i + 1;
    while (j < events.length && isMergeableMutation(events[j])) {
      j++;
    }

    result.push(j > i + 1 ? mergeGroup(events.slice(i, j)) : events[i]);
    i = j;
  }

  return result;
}
