import { EventType, IncrementalSource } from '@amplitude/rrweb-types';
import type { eventWithTime, mutationData } from '@amplitude/rrweb-types';

function isMergeableMutation(event: eventWithTime): boolean {
  if (event.type !== EventType.IncrementalSnapshot) return false;
  const data = event.data as mutationData;
  return data.source === IncrementalSource.Mutation && !data.isAttachIframe;
}

function canSafelyMerge(events: eventWithTime[]): boolean {
  // The replayer processes all removes before all adds in a merged event. This changes
  // cross-event ordering: originally E1.adds execute before E2.removes, but after merging
  // E2.removes execute before E1.adds. Check if any node added in an earlier event is
  // removed in a later event - if so, merging would cause the remove to execute before
  // the add, leaving the node permanently in the DOM.
  const addedNodeIds = new Set<number>();

  for (const event of events) {
    const data = event.data as mutationData;

    // Check if this event removes any node that was added in a previous event
    for (const remove of data.removes) {
      if (addedNodeIds.has(remove.id)) {
        return false;
      }
    }

    // Track nodes added in this event
    for (const add of data.adds) {
      addedNodeIds.add(add.node.id);
    }
  }

  return true;
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

    const group = events.slice(i, j);
    if (j > i + 1 && canSafelyMerge(group)) {
      result.push(mergeGroup(group));
    } else {
      result.push(...group);
    }
    i = j;
  }

  return result;
}
