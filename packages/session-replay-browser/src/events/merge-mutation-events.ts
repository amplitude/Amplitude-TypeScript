import { EventType, IncrementalSource } from '@amplitude/rrweb-types';
import type { eventWithTime, mutationData, styleOMValue } from '@amplitude/rrweb-types';

function isMergeableMutation(event: eventWithTime): boolean {
  if (event.type !== EventType.IncrementalSnapshot) return false;
  const data = event.data as mutationData;
  return data.source === IncrementalSource.Mutation && !data.isAttachIframe;
}

// In this repo's rrweb, a `style` attribute value is `string | styleOMValue | null`.
// A `string` (or `null`) is a full replacement/removal; a `styleOMValue` object is a
// PARTIAL diff that the replayer applies cumulatively (per-property setProperty /
// removeProperty, where a `false` value means "delete this property"). Unlisted
// properties are never cleared by an object-form write.
type StyleValue = string | styleOMValue | null;

function isStyleObject(value: StyleValue): value is styleOMValue {
  return typeof value === 'object' && value !== null;
}

/**
 * Deep-merges a run of object-form (`styleOMValue`) style diffs into a single
 * object. Later writes win on a per-property basis, exactly mirroring how the
 * rrweb replayer applies object-form styles cumulatively. A `false` value
 * (delete) is preserved so the merged write still removes the property.
 */
function mergeStyleDiffs(diffs: styleOMValue[]): styleOMValue {
  const merged: styleOMValue = {};
  for (const diff of diffs) {
    for (const prop of Object.keys(diff)) {
      merged[prop] = diff[prop];
    }
  }
  return merged;
}

/**
 * Coalesces `style` attribute mutations within a merged group in a way that is
 * faithful to how the rrweb replayer applies them, so the merged payload stays
 * small without dropping any property that real cumulative replay would keep.
 *
 * Per node id, the surviving `style` writes are computed as follows:
 *   - A `string`/`null` style write is a FULL reset: it supersedes every earlier
 *     style write for that node. Only the last such reset is kept.
 *   - Object-form (`styleOMValue`) writes after the last reset are PARTIAL diffs
 *     applied cumulatively; they are deep-merged (later property wins, `false`
 *     deletes preserved) into a single object placed at the last write's
 *     position. Earlier superseded object writes are dropped.
 *   - When all of a node's style writes are object-form, they all merge into one.
 *
 * This means a pure burst of string-form updates collapses to last-write-wins
 * (the common inline-style/opacity ticker case), while object-form partial diffs
 * such as `{color:'red'}` then `{background:'blue'}` are combined into
 * `{color:'red', background:'blue'}` rather than silently losing `color`.
 *
 * Only the `style` key is coalesced. Any other attribute keys on a superseded
 * entry are preserved in place, and non-style entries are left untouched.
 */
function coalesceStyleAttributes(attributes: mutationData['attributes']): mutationData['attributes'] {
  // Per node id, the array indices of attribute mutations carrying a `style` key.
  const styleIndicesById = new Map<number, number[]>();
  attributes.forEach((attr, i) => {
    if (attr.attributes && 'style' in attr.attributes) {
      const list = styleIndicesById.get(attr.id);
      if (list) list.push(i);
      else styleIndicesById.set(attr.id, [i]);
    }
  });

  if (styleIndicesById.size === 0) return attributes;

  const styleValueAt = (i: number): StyleValue => (attributes[i].attributes as Record<string, StyleValue>).style;

  // Per attributes-array index: 'drop' removes the (superseded) style key.
  // mergedStyleByIndex replaces the style value with a deep-merged object.
  // Indices not present in either map keep their style value untouched.
  const dropStyleAt = new Set<number>();
  const mergedStyleByIndex = new Map<number, styleOMValue>();

  for (const indices of styleIndicesById.values()) {
    if (indices.length === 1) continue; // single style write — keep as-is

    // Position (within `indices`) of the last full-reset string/null write.
    let lastResetPos = -1;
    indices.forEach((idx, pos) => {
      if (!isStyleObject(styleValueAt(idx))) lastResetPos = pos;
    });

    // Object-form writes that survive: those after the last reset (or all of
    // them when there is no reset). Everything before the last reset is dropped.
    const survivingObjectIndices: number[] = [];
    indices.forEach((idx, pos) => {
      if (pos === lastResetPos) return; // the surviving full-reset write — keep
      dropStyleAt.add(idx);
      if (pos > lastResetPos) survivingObjectIndices.push(idx);
    });

    if (survivingObjectIndices.length > 0) {
      const lastObjectIdx = survivingObjectIndices[survivingObjectIndices.length - 1];
      const merged = mergeStyleDiffs(survivingObjectIndices.map((idx) => styleValueAt(idx) as styleOMValue));
      dropStyleAt.delete(lastObjectIdx);
      mergedStyleByIndex.set(lastObjectIdx, merged);
    }
  }

  if (dropStyleAt.size === 0 && mergedStyleByIndex.size === 0) return attributes;

  const result: mutationData['attributes'] = [];
  attributes.forEach((attr, i) => {
    const mergedStyle = mergedStyleByIndex.get(i);
    if (mergedStyle !== undefined) {
      result.push({ ...attr, attributes: { ...attr.attributes, style: mergedStyle } });
      return;
    }
    if (!dropStyleAt.has(i)) {
      result.push(attr);
      return;
    }
    // Superseded style write: drop only the `style` key, preserving any other
    // attribute keys. If the entry was style-only, it is dropped entirely.
    const rest = { ...attr.attributes };
    delete rest.style;
    if (Object.keys(rest).length > 0) {
      result.push({ ...attr, attributes: rest });
    }
  });

  return result;
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
  // would be orphaned, so treat them as cancelled too.
  // Use lastParentById so a node moved away from a cancelled parent to a live one is not wrongly elided.
  //
  // Three cascade outcomes mirror the main-loop classification:
  //   transientIds:            no pre-existing removes (node created in window), or no remove/add overlap
  //   preExistingTransientIds: nodeFirstRemoveIdx < nodeFirstAddIdx (pre-existing, removed before re-add)
  //   cascadeDropAddsOnlyIds:  nodeFirstRemoveIdx === nodeFirstAddIdx (same-event move to cancelled parent)
  //                            → drop adds but preserve removes from non-cancelled parents
  const cascadeDropAddsOnlyIds = new Set<number>();
  if (transientIds.size > 0 || preExistingTransientIds.size > 0) {
    let changed = true;
    while (changed) {
      changed = false;
      for (const [nodeId, parentId] of lastParentById) {
        if (
          !transientIds.has(nodeId) &&
          !preExistingTransientIds.has(nodeId) &&
          !cascadeDropAddsOnlyIds.has(nodeId) &&
          (transientIds.has(parentId) || preExistingTransientIds.has(parentId) || cascadeDropAddsOnlyIds.has(parentId))
        ) {
          const nodeFirstRemoveIdx = firstRemoveEventIndex.get(nodeId);
          const nodeFirstAddIdx = firstAddEventIndex.get(nodeId);
          if (
            nodeFirstRemoveIdx !== undefined &&
            nodeFirstAddIdx !== undefined &&
            nodeFirstRemoveIdx < nodeFirstAddIdx
          ) {
            preExistingTransientIds.add(nodeId);
          } else if (
            nodeFirstRemoveIdx !== undefined &&
            nodeFirstAddIdx !== undefined &&
            nodeFirstRemoveIdx === nodeFirstAddIdx
          ) {
            cascadeDropAddsOnlyIds.add(nodeId);
          } else {
            transientIds.add(nodeId);
          }
          changed = true;
        }
      }
    }
  }

  const needsFilter = transientIds.size > 0 || preExistingTransientIds.size > 0 || cascadeDropAddsOnlyIds.size > 0;

  // Build filtered removes by iterating per event so we know each remove's event index.
  // Pure transients:          drop all removes.
  // Pre-existing transients:  drop removes at eventIdx >= firstAddIdx (the cancelled re-add cycle);
  //                           keep removes at eventIdx < firstAddIdx (legitimate pre-window removal).
  // Cascade drop-adds-only:   keep removes from non-cancelled parents; drop removes from cancelled parents
  //                           (the cancelled parent is never added in the replay, so a remove from it
  //                           would reference a non-existent node in the replayer).
  const filteredRemoves: mutationData['removes'][0][] = [];
  events.forEach((e, eventIdx) => {
    for (const r of (e.data as mutationData).removes) {
      if (transientIds.has(r.id)) continue;
      if (preExistingTransientIds.has(r.id) && eventIdx >= firstAddEventIndex.get(r.id)!) continue;
      if (
        cascadeDropAddsOnlyIds.has(r.id) &&
        (transientIds.has(r.parentId) ||
          preExistingTransientIds.has(r.parentId) ||
          cascadeDropAddsOnlyIds.has(r.parentId))
      )
        continue;
      filteredRemoves.push(r);
    }
  });

  const allAdds = events.flatMap((e) => (e.data as mutationData).adds);
  const allTexts = events.flatMap((e) => (e.data as mutationData).texts);
  const allAttributes = events.flatMap((e) => (e.data as mutationData).attributes);

  const mergedAttributes = needsFilter
    ? allAttributes.filter(
        (a) => !transientIds.has(a.id) && !preExistingTransientIds.has(a.id) && !cascadeDropAddsOnlyIds.has(a.id),
      )
    : allAttributes;

  const merged: mutationData = {
    source: IncrementalSource.Mutation,
    removes: filteredRemoves,
    adds: needsFilter
      ? allAdds.filter(
          (a) =>
            !transientIds.has(a.node.id) &&
            !preExistingTransientIds.has(a.node.id) &&
            !cascadeDropAddsOnlyIds.has(a.node.id),
        )
      : allAdds,
    texts: needsFilter
      ? allTexts.filter(
          (t) => !transientIds.has(t.id) && !preExistingTransientIds.has(t.id) && !cascadeDropAddsOnlyIds.has(t.id),
        )
      : allTexts,
    attributes: coalesceStyleAttributes(mergedAttributes),
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
