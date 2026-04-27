import { EventType, IncrementalSource } from '@amplitude/rrweb-types';
import type { eventWithTime, mutationData, scrollData } from '@amplitude/rrweb-types';
import { mergeMutationEvents } from '../src/events/merge-mutation-events';

function makeMutation(timestamp: number, overrides: Partial<mutationData> = {}): eventWithTime {
  return {
    type: EventType.IncrementalSnapshot,
    timestamp,
    data: {
      source: IncrementalSource.Mutation,
      texts: [],
      attributes: [],
      removes: [],
      adds: [],
      ...overrides,
    } as mutationData,
  };
}

function makeScroll(timestamp: number): eventWithTime {
  return {
    type: EventType.IncrementalSnapshot,
    timestamp,
    data: { source: IncrementalSource.Scroll, id: 1, x: 0, y: 100 } as scrollData,
  };
}

function makeFullSnapshot(timestamp: number): eventWithTime {
  return {
    type: EventType.FullSnapshot,
    timestamp,
    data: { node: {} as any, initialOffset: { top: 0, left: 0 } },
  };
}

describe('mergeMutationEvents', () => {
  test('returns single-element array unchanged', () => {
    const event = makeMutation(1000);
    expect(mergeMutationEvents([event])).toEqual([event]);
  });

  test('merges two consecutive mutations into one', () => {
    const e1 = makeMutation(1000, {
      adds: [{ parentId: 1, nextId: null, node: { id: 10 } as any }],
      removes: [{ parentId: 1, id: 5 }],
      texts: [{ id: 2, value: 'hello' }],
      attributes: [{ id: 3, attributes: { class: 'foo' } }],
    });
    const e2 = makeMutation(1050, {
      adds: [{ parentId: 10, nextId: null, node: { id: 11 } as any }],
      removes: [{ parentId: 1, id: 6 }],
      texts: [{ id: 4, value: 'world' }],
      attributes: [{ id: 7, attributes: { class: 'bar' } }],
    });

    const result = mergeMutationEvents([e1, e2]);

    expect(result).toHaveLength(1);
    const data = result[0].data as mutationData;
    // Removes from both events, in order
    expect(data.removes).toEqual([
      { parentId: 1, id: 5 },
      { parentId: 1, id: 6 },
    ]);
    // Adds from both events, in order
    expect(data.adds).toEqual([(e1.data as mutationData).adds[0], (e2.data as mutationData).adds[0]]);
    // Texts concatenated
    expect(data.texts).toEqual([
      { id: 2, value: 'hello' },
      { id: 4, value: 'world' },
    ]);
    // Attributes concatenated (replayer applies last-write-wins)
    expect(data.attributes).toEqual([
      { id: 3, attributes: { class: 'foo' } },
      { id: 7, attributes: { class: 'bar' } },
    ]);
    // Timestamp from first event
    expect(result[0].timestamp).toBe(1000);
  });

  test('merges three consecutive mutations into one', () => {
    const events = [makeMutation(1000), makeMutation(1010), makeMutation(1020)];
    const result = mergeMutationEvents(events);
    expect(result).toHaveLength(1);
  });

  test('does not merge mutations separated by a non-mutation event', () => {
    const e1 = makeMutation(1000);
    const scroll = makeScroll(1010);
    const e2 = makeMutation(1020);

    const result = mergeMutationEvents([e1, scroll, e2]);

    expect(result).toHaveLength(3);
    expect(result[0]).toBe(e1);
    expect(result[1]).toBe(scroll);
    expect(result[2]).toBe(e2);
  });

  test('does not merge mutations separated by a FullSnapshot event', () => {
    const e1 = makeMutation(1000);
    const full = makeFullSnapshot(1010);
    const e2 = makeMutation(1020);

    const result = mergeMutationEvents([e1, full, e2]);

    expect(result).toHaveLength(3);
    expect(result[0]).toBe(e1);
    expect(result[1]).toBe(full);
    expect(result[2]).toBe(e2);
  });

  test('passes non-mutation IncrementalSnapshot events through unchanged', () => {
    const scroll = makeScroll(1000);
    const result = mergeMutationEvents([scroll]);
    expect(result).toEqual([scroll]);
  });

  test('passes FullSnapshot events through unchanged', () => {
    const full = makeFullSnapshot(1000);
    const result = mergeMutationEvents([full]);
    expect(result).toEqual([full]);
  });

  test('does not merge isAttachIframe mutations', () => {
    const e1 = makeMutation(1000, { isAttachIframe: true });
    const e2 = makeMutation(1010, { isAttachIframe: true });

    const result = mergeMutationEvents([e1, e2]);

    expect(result).toHaveLength(2);
    expect(result[0]).toBe(e1);
    expect(result[1]).toBe(e2);
  });

  test('does not merge a normal mutation with an isAttachIframe mutation', () => {
    const normal = makeMutation(1000);
    const iframe = makeMutation(1010, { isAttachIframe: true });

    const result = mergeMutationEvents([normal, iframe]);

    expect(result).toHaveLength(2);
  });

  test('merges runs correctly in a mixed sequence', () => {
    const m1 = makeMutation(1000);
    const m2 = makeMutation(1010);
    const scroll = makeScroll(1020);
    const m3 = makeMutation(1030);
    const m4 = makeMutation(1040);
    const m5 = makeMutation(1050);

    const result = mergeMutationEvents([m1, m2, scroll, m3, m4, m5]);

    expect(result).toHaveLength(3);
    expect(result[0].timestamp).toBe(1000); // merged m1+m2
    expect(result[1]).toBe(scroll);
    expect(result[2].timestamp).toBe(1030); // merged m3+m4+m5
  });

  test('empty array returns empty array', () => {
    expect(mergeMutationEvents([])).toEqual([]);
  });

  describe('transient node elision', () => {
    test('elides a node added then removed in the same merge window', () => {
      const e1 = makeMutation(1000, {
        adds: [{ parentId: 1, nextId: null, node: { id: 10 } as any }],
      });
      const e2 = makeMutation(1010, {
        removes: [{ parentId: 1, id: 10 }],
      });

      const result = mergeMutationEvents([e1, e2]);

      expect(result).toHaveLength(1);
      const data = result[0].data as mutationData;
      expect(data.adds).toHaveLength(0);
      expect(data.removes).toHaveLength(0);
    });

    test('keeps removes for pre-existing nodes not in the adds set', () => {
      const e1 = makeMutation(1000, {
        removes: [{ parentId: 1, id: 99 }], // pre-existing node
      });
      const e2 = makeMutation(1010, {
        adds: [{ parentId: 1, nextId: null, node: { id: 10 } as any }],
      });

      const result = mergeMutationEvents([e1, e2]);

      const data = result[0].data as mutationData;
      expect(data.removes).toEqual([{ parentId: 1, id: 99 }]);
      expect(data.adds).toHaveLength(1);
    });

    test('cascades elision to children of a transient parent', () => {
      const e1 = makeMutation(1000, {
        adds: [
          { parentId: 1, nextId: null, node: { id: 10 } as any }, // parent
          { parentId: 10, nextId: null, node: { id: 11 } as any }, // child of transient parent
        ],
      });
      const e2 = makeMutation(1010, {
        removes: [{ parentId: 1, id: 10 }], // removes the parent
      });

      const result = mergeMutationEvents([e1, e2]);

      const data = result[0].data as mutationData;
      expect(data.adds).toHaveLength(0); // parent and child both elided
      expect(data.removes).toHaveLength(0);
    });

    test('does not elide a node removed then re-added (DOM move)', () => {
      // remove in event1, re-add in event2 — this is a cross-event DOM move, not transient
      const e1 = makeMutation(1000, {
        removes: [{ parentId: 1, id: 10 }],
      });
      const e2 = makeMutation(1010, {
        adds: [{ parentId: 2, nextId: null, node: { id: 10 } as any }],
      });

      const result = mergeMutationEvents([e1, e2]);

      const data = result[0].data as mutationData;
      expect(data.removes).toEqual([{ parentId: 1, id: 10 }]);
      expect(data.adds).toHaveLength(1);
      expect((data.adds[0].node as any).id).toBe(10);
    });

    test('does not elide a node added then moved (add-then-move)', () => {
      // add in event1, move (remove+re-add to new parent) in event2 — node should survive at new parent
      const e1 = makeMutation(1000, {
        adds: [{ parentId: 1, nextId: null, node: { id: 10 } as any }],
      });
      const e2 = makeMutation(1010, {
        removes: [{ parentId: 1, id: 10 }],
        adds: [{ parentId: 2, nextId: null, node: { id: 10 } as any }],
      });

      const result = mergeMutationEvents([e1, e2]);

      const data = result[0].data as mutationData;
      // Node 10 should appear as a remove from parent 1 and add to parent 2
      expect(data.removes.some((r) => r.id === 10)).toBe(true);
      expect(data.adds.some((a) => (a.node as any).id === 10 && a.parentId === 2)).toBe(true);
    });

    test('filters texts for transient node IDs', () => {
      const e1 = makeMutation(1000, {
        adds: [{ parentId: 1, nextId: null, node: { id: 10 } as any }],
        texts: [{ id: 10, value: 'hello' }],
      });
      const e2 = makeMutation(1010, {
        removes: [{ parentId: 1, id: 10 }],
      });

      const result = mergeMutationEvents([e1, e2]);

      const data = result[0].data as mutationData;
      expect(data.adds).toHaveLength(0);
      expect(data.removes).toHaveLength(0);
      expect(data.texts).toHaveLength(0);
    });

    test('filters attributes for transient node IDs', () => {
      const e1 = makeMutation(1000, {
        adds: [{ parentId: 1, nextId: null, node: { id: 10 } as any }],
        attributes: [{ id: 10, attributes: { class: 'foo' } }],
      });
      const e2 = makeMutation(1010, {
        removes: [{ parentId: 1, id: 10 }],
      });

      const result = mergeMutationEvents([e1, e2]);

      const data = result[0].data as mutationData;
      expect(data.adds).toHaveLength(0);
      expect(data.removes).toHaveLength(0);
      expect(data.attributes).toHaveLength(0);
    });

    test('does not elide a child that was moved away from a transient parent', () => {
      // Child C is added under transient parent P, then moved to non-transient parent Q.
      // P is added then removed (transient). C ends up under Q and must survive.
      const e1 = makeMutation(1000, {
        adds: [
          { parentId: 1, nextId: null, node: { id: 10 } as any }, // transient parent P
          { parentId: 10, nextId: null, node: { id: 11 } as any }, // child C under P
        ],
      });
      const e2 = makeMutation(1010, {
        removes: [
          { parentId: 1, id: 10 }, // remove P (transient)
          { parentId: 10, id: 11 }, // move C away from P
        ],
        adds: [{ parentId: 2, nextId: null, node: { id: 11 } as any }], // C re-added under Q
      });

      const result = mergeMutationEvents([e1, e2]);

      const data = result[0].data as mutationData;
      // P (id=10) should be elided (add + remove cancelled)
      expect(data.adds.some((a) => (a.node as any).id === 10)).toBe(false);
      expect(data.removes.some((r) => r.id === 10)).toBe(false);
      // C (id=11) should survive at its final parent Q (parentId=2)
      expect(data.adds.some((a) => (a.node as any).id === 11 && a.parentId === 2)).toBe(true);
    });

    test('preserves same-event move followed by a later remove (does not misclassify as pre-existing transient)', () => {
      // Node 10 is moved (remove+add in e1 — same event index) then removed in e2.
      // firstAddIdx === firstRemoveIdx (both 0): must NOT be classified as pre-existing transient.
      // All operations must survive so the move and final removal are both applied.
      const e1 = makeMutation(1000, {
        removes: [{ parentId: 1, id: 10 }],
        adds: [{ parentId: 2, nextId: null, node: { id: 10 } as any }],
      });
      const e2 = makeMutation(1010, { removes: [{ parentId: 2, id: 10 }] });

      const result = mergeMutationEvents([e1, e2]);

      const data = result[0].data as mutationData;
      // Both removes must survive (not erased by pre-existing-transient misclassification)
      expect(data.removes.some((r) => r.id === 10 && r.parentId === 1)).toBe(true);
      expect(data.removes.some((r) => r.id === 10 && r.parentId === 2)).toBe(true);
      // The add (move destination) must survive
      expect(data.adds.some((a) => (a.node as any).id === 10 && a.parentId === 2)).toBe(true);
    });

    test('cancels re-add and post-add remove for pre-existing node removed, re-added, and removed again', () => {
      // Node 99 pre-exists: removed from parent1 in e1, re-added to parent2 in e2, removed from parent2 in e3.
      // The rrweb replayer applies all removes first: both removes fire, then the add re-creates the node
      // at parent2 — leaving it present when it should be absent.
      // Fix: cancel the re-add and the post-add remove; keep only the original pre-add remove.
      const e1 = makeMutation(1000, { removes: [{ parentId: 1, id: 99 }] });
      const e2 = makeMutation(1010, { adds: [{ parentId: 2, nextId: null, node: { id: 99 } as any }] });
      const e3 = makeMutation(1020, { removes: [{ parentId: 2, id: 99 }] });

      const result = mergeMutationEvents([e1, e2, e3]);

      const data = result[0].data as mutationData;
      // Original remove (from parent1) must survive
      expect(data.removes.some((r) => r.id === 99 && r.parentId === 1)).toBe(true);
      // Re-add and post-add remove must be cancelled
      expect(data.removes.some((r) => r.id === 99 && r.parentId === 2)).toBe(false);
      expect(data.adds.some((a) => (a.node as any).id === 99)).toBe(false);
    });

    test('filters texts belonging to pre-existing-transient nodes', () => {
      const e1 = makeMutation(1000, { removes: [{ parentId: 1, id: 99 }] });
      const e2 = makeMutation(1010, {
        adds: [{ parentId: 2, nextId: null, node: { id: 99 } as any }],
        texts: [{ id: 99, value: 'during re-add' }],
      });
      const e3 = makeMutation(1020, { removes: [{ parentId: 2, id: 99 }] });

      const result = mergeMutationEvents([e1, e2, e3]);

      const data = result[0].data as mutationData;
      expect(data.texts).toHaveLength(0);
    });

    test('filters attributes belonging to pre-existing-transient nodes', () => {
      const e1 = makeMutation(1000, { removes: [{ parentId: 1, id: 99 }] });
      const e2 = makeMutation(1010, {
        adds: [{ parentId: 2, nextId: null, node: { id: 99 } as any }],
        attributes: [{ id: 99, attributes: { class: 'during-readd' } }],
      });
      const e3 = makeMutation(1020, { removes: [{ parentId: 2, id: 99 }] });

      const result = mergeMutationEvents([e1, e2, e3]);

      const data = result[0].data as mutationData;
      expect(data.attributes).toHaveLength(0);
    });

    test('cascades elision to children added under a pre-existing-transient re-add', () => {
      // Node 99 pre-exists: removed in e1, re-added in e2 with a new child 100, removed in e3.
      // The re-add of 99 is cancelled; child 100 (whose final parent is the cancelled re-add)
      // is also elided.
      const e1 = makeMutation(1000, { removes: [{ parentId: 1, id: 99 }] });
      const e2 = makeMutation(1010, {
        adds: [
          { parentId: 1, nextId: null, node: { id: 99 } as any },
          { parentId: 99, nextId: null, node: { id: 100 } as any },
        ],
      });
      const e3 = makeMutation(1020, { removes: [{ parentId: 1, id: 99 }] });

      const result = mergeMutationEvents([e1, e2, e3]);

      const data = result[0].data as mutationData;
      expect(data.removes.some((r) => r.id === 99 && r.parentId === 1)).toBe(true);
      expect(data.adds.some((a) => (a.node as any).id === 99)).toBe(false);
      expect(data.adds.some((a) => (a.node as any).id === 100)).toBe(false);
    });

    test('only elides the transient node, keeps non-transient adds and removes', () => {
      const e1 = makeMutation(1000, {
        adds: [
          { parentId: 1, nextId: null, node: { id: 10 } as any }, // transient
          { parentId: 1, nextId: null, node: { id: 20 } as any }, // stays
        ],
      });
      const e2 = makeMutation(1010, {
        removes: [
          { parentId: 1, id: 10 }, // removes transient
          { parentId: 1, id: 99 }, // removes pre-existing node
        ],
      });

      const result = mergeMutationEvents([e1, e2]);

      const data = result[0].data as mutationData;
      expect(data.adds).toEqual([{ parentId: 1, nextId: null, node: { id: 20 } as any }]);
      expect(data.removes).toEqual([{ parentId: 1, id: 99 }]);
    });
  });
});
