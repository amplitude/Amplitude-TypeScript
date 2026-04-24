import { EventType, IncrementalSource } from '@amplitude/rrweb-types';
import type { eventWithTime, mutationData } from '@amplitude/rrweb-types';

function isMergeableMutation(event: eventWithTime): boolean {
  if (event.type !== EventType.IncrementalSnapshot) return false;
  const data = event.data as mutationData;
  return data.source === IncrementalSource.Mutation && !data.isAttachIframe;
}

function mergeGroup(events: eventWithTime[]): eventWithTime {
  const first = events[0];

  const allRemoves = events.flatMap((e) => (e.data as mutationData).removes);
  const allAdds = events.flatMap((e) => (e.data as mutationData).adds);

  // Elide transient nodes: a node added in an earlier event and removed in a later one
  // would otherwise have its remove execute before its add (since we put all removes
  // first), leaving the node permanently in the DOM. Cancel both the add and the remove,
  // and cascade to any adds whose parent is also transient.
  const addedInEvent = new Map<number, number>();
  for (let eventIdx = 0; eventIdx < events.length; eventIdx++) {
    const adds = (events[eventIdx].data as mutationData).adds;
    for (const add of adds) {
      if (!addedInEvent.has(add.node.id)) {
        addedInEvent.set(add.node.id, eventIdx);
      }
    }
  }
  const removedInEvent = new Map<number, number>();
  for (let eventIdx = 0; eventIdx < events.length; eventIdx++) {
    const removes = (events[eventIdx].data as mutationData).removes;
    for (const remove of removes) {
      if (!removedInEvent.has(remove.id)) {
        removedInEvent.set(remove.id, eventIdx);
      }
    }
  }
  const transientIds = new Set<number>();
  for (const add of allAdds) {
    const addEventIdx = addedInEvent.get(add.node.id);
    const removeEventIdx = removedInEvent.get(add.node.id);
    if (addEventIdx !== undefined && removeEventIdx !== undefined && addEventIdx < removeEventIdx) {
      transientIds.add(add.node.id);
    }
  }
  if (transientIds.size > 0) {
    let changed = true;
    while (changed) {
      changed = false;
      for (const add of allAdds) {
        if (!transientIds.has(add.node.id) && transientIds.has(add.parentId)) {
          transientIds.add(add.node.id);
          changed = true;
        }
      }
    }
  }

  const allTexts = events.flatMap((e) => (e.data as mutationData).texts);
  const allAttributes = events.flatMap((e) => (e.data as mutationData).attributes);

  const merged: mutationData = {
    source: IncrementalSource.Mutation,
    removes: transientIds.size > 0 ? allRemoves.filter((r) => !transientIds.has(r.id)) : allRemoves,
    adds: transientIds.size > 0 ? allAdds.filter((a) => !transientIds.has(a.node.id)) : allAdds,
    texts: transientIds.size > 0 ? allTexts.filter((t) => !transientIds.has(t.id)) : allTexts,
    attributes: transientIds.size > 0 ? allAttributes.filter((a) => !transientIds.has(a.id)) : allAttributes,
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
