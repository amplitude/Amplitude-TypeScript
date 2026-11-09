import { SEMANTIC_VERSION, SemanticEventEnvelope, SemanticIdentity } from '../src';

// Exercise the public type exports without defining a production event family.
const identity: SemanticIdentity = { tab_id: 'test-tab', document_id: 'test-document' };
const event: SemanticEventEnvelope<'test-only', { count: number }> = {
  name: 'test-only',
  timestamp: 123,
  payload: { ...identity, v: SEMANTIC_VERSION, count: 1 },
};

test('exports a versioned envelope contract that preserves the host payload', () => {
  expect(JSON.parse(JSON.stringify(event))).toEqual({
    name: 'test-only',
    timestamp: 123,
    payload: { tab_id: 'test-tab', document_id: 'test-document', v: 1, count: 1 },
  });
});

// These compile-time assertions protect event-name/payload pairing and required metadata.
// @ts-expect-error The event name must match the selected family.
const invalidName: typeof event = { ...event, name: 'different-family' };
// @ts-expect-error Version and identity are mandatory, even for a payload with no domain fields.
const missingMetadata: SemanticEventEnvelope<'test-only', object> = { name: 'test-only', timestamp: 0, payload: {} };
void invalidName;
void missingMetadata;
