import { EventType, IncrementalSource } from '@amplitude/rrweb-types';
import type { eventWithTime, mutationData } from '@amplitude/rrweb-types';

function isMergeableMutation(event: eventWithTime): boolean {
  if (event.type !== EventType.IncrementalSnapshot) return false;
  const data = event.data as mutationData;
  return data.source === IncrementalSource.Mutation && !data.isAttachIframe;
}

function mergeGroup(events: eventWithTime[]): eventWithTime {
  const first = events[0];

  // Track first/last event index for each node's adds and removes.
  // lastParentById: final parent from most recent add (last-write-wins).
  const firstAddEventIndex = new Map<number, number>();
  const lastAddEventIndex = new Map<number, number>();
  const firstRemoveEventIndex = new Map<number, number>();
  const lastRemoveEventIndex = new Map<number, number>();
  const lastParentById = new Map<number, number>();
  events.forEach((e, i) => {
    const data = e.data as mutationData;
    for (const add of data.adds) {
      if (!firstAddEventIndex.has(add.node.id)) firstAddEventIndex.set(add.node.id, i);
      lastAddEventIndex.set(add.node.id, i);
      lastParentById.set(add.node.id, add.parentId);
    }
    for (const remove of data.removes) {
      if (!firstRemoveEventIndex.has(remove.id)) firstRemoveEventIndex.set(remove.id, i);
      lastRemoveEventIndex.set(remove.id, i);
    }
  });

  // Classify nodes that appear in both adds and removes within this window:
  //
  // Pure transient:          created here (firstAddIdx < firstRemoveIdx) and ultimately removed
  //                          (lastAddIdx < lastRemoveIdx). Cancel all adds + all removes.
  //
  // Pre-existing transient:  pre-existed in DOM (firstRemoveIdx < firstAddIdx — removed before
  //                          first add), then re-added, then removed again (lastAddIdx < lastRemoveIdx).
  //                          The rrweb replayer processes all removes first: the re-add would still
  //                          execute after both removes, leaving the node present when it should be
  //                          absent. Fix: cancel the re-add and all post-add removes; keep only the
  //                          pre-add removes (they represent the legitimate removal from the original
  //                          location).
  const transientIds = new Set<number>();
  const preExistingTransientIds = new Set<number>();

  for (const [id, firstAddIdx] of firstAddEventIndex) {
    const firstRemoveIdx = firstRemoveEventIndex.get(id);
    if (firstRemoveIdx === undefined) continue;
    const lastAddIdx = lastAddEventIndex.get(id)!;
    const lastRemoveIdx = lastRemoveEventIndex.get(id)!;
    if (lastAddIdx >= lastRemoveIdx) continue; // ultimately present — keep as-is

    if (firstAddIdx < firstRemoveIdx) {
      transientIds.add(id);
    } else if (firstRemoveIdx < firstAddIdx) {
      // firstRemoveIdx < firstAddIdx: pre-existing node removed, re-added, then removed again
      preExistingTransientIds.add(id);
    }
    // firstAddIdx === firstRemoveIdx: same-event move (remove+add in one rrweb event) followed
    // by a later remove — keep all operations so the move and final removal survive
  }

  // Cascade: nodes whose FINAL parent is effectively cancelled (transient or pre-existing-transient)
  // would be orphaned, so treat them as pure transients too.
  // Use lastParentById so a node moved away from a cancelled parent to a live one is not wrongly elided.
  if (transientIds.size > 0 || preExistingTransientIds.size > 0) {
    let changed = true;
    while (changed) {
      changed = false;
      for (const [nodeId, parentId] of lastParentById) {
        if (
          !transientIds.has(nodeId) &&
          !preExistingTransientIds.has(nodeId) &&
          (transientIds.has(parentId) || preExistingTransientIds.has(parentId))
        ) {
          const nodeFirstRemoveIdx = firstRemoveEventIndex.get(nodeId);
          const nodeFirstAddIdx = firstAddEventIndex.get(nodeId);
          if (
            nodeFirstRemoveIdx !== undefined &&
            nodeFirstAddIdx !== undefined &&
            nodeFirstRemoveIdx < nodeFirstAddIdx
          ) {
            preExistingTransientIds.add(nodeId);
          } else {
            transientIds.add(nodeId);
          }
          changed = true;
        }
      }
    }
  }

  const needsFilter = transientIds.size > 0 || preExistingTransientIds.size > 0;

  // Build filtered removes by iterating per event so we know each remove's event index.
  // Pure transients:          drop all removes.
  // Pre-existing transients:  drop removes at eventIdx >= firstAddIdx (the cancelled re-add cycle);
  //                           keep removes at eventIdx < firstAddIdx (legitimate pre-window removal).
  const filteredRemoves: mutationData['removes'][0][] = [];
  events.forEach((e, eventIdx) => {
    for (const r of (e.data as mutationData).removes) {
      if (transientIds.has(r.id)) continue;
      if (preExistingTransientIds.has(r.id) && eventIdx >= firstAddEventIndex.get(r.id)!) continue;
      filteredRemoves.push(r);
    }
  });

  const allAdds = events.flatMap((e) => (e.data as mutationData).adds);
  const allTexts = events.flatMap((e) => (e.data as mutationData).texts);
  const allAttributes = events.flatMap((e) => (e.data as mutationData).attributes);

  const merged: mutationData = {
    source: IncrementalSource.Mutation,
    removes: filteredRemoves,
    adds: needsFilter
      ? allAdds.filter((a) => !transientIds.has(a.node.id) && !preExistingTransientIds.has(a.node.id))
      : allAdds,
    texts: needsFilter
      ? allTexts.filter((t) => !transientIds.has(t.id) && !preExistingTransientIds.has(t.id))
      : allTexts,
    attributes: needsFilter
      ? allAttributes.filter((a) => !transientIds.has(a.id) && !preExistingTransientIds.has(a.id))
      : allAttributes,
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
