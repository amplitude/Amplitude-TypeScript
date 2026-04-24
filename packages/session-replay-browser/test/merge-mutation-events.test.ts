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

  test('does not merge when a node added in one event is removed in a later event', () => {
    // This is the bug scenario: E1 adds node 100, E2 removes node 100.
    // If merged, the replayer would process removes before adds, causing:
    // 1. Try to remove 100 (doesn't exist yet, no-op)
    // 2. Add 100
    // Result: node 100 persists incorrectly
    //
    // By not merging, we preserve the correct order:
    // 1. E1: add 100
    // 2. E2: remove 100
    // Result: node 100 is correctly removed
    const e1 = makeMutation(1000, {
      adds: [{ parentId: 1, nextId: null, node: { id: 100 } as any }],
    });
    const e2 = makeMutation(1010, {
      removes: [{ parentId: 1, id: 100 }],
    });

    const result = mergeMutationEvents([e1, e2]);

    // Should NOT merge - must keep as separate events to preserve execution order
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(e1);
    expect(result[1]).toBe(e2);
  });
});
