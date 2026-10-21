import Ajv from 'ajv';
import * as schema from '../schema.json';
import * as examples from './fixtures/semantic-events.json';

const validate = new Ajv({ strict: true }).compile(schema);

test.each(examples.map((event) => [event.data.tag, event] as const))(
  '%s matches the shared wire schema',
  (_tag, event) => {
    expect(validate(event)).toBe(true);
  },
);

test('schema rejects raw field values and unknown versions', () => {
  const field = examples.find((event) => event.data.tag === 'amp-semantic/field');
  if (!field) throw new Error('field fixture missing');
  expect(validate({ ...field, data: { ...field.data, payload: { ...field.data.payload, value: 'private' } } })).toBe(
    false,
  );
  expect(validate({ ...field, data: { ...field.data, payload: { ...field.data.payload, v: 2 } } })).toBe(false);
});

test('context accepts older v1 payloads while validating new browser context fields', () => {
  const context = examples.find((event) => event.data.tag === 'amp-semantic/context');
  if (!context) throw new Error('context fixture missing');
  const legacyPayload = { ...context.data.payload };
  delete legacyPayload.visibility_state;
  delete legacyPayload.user_agent;
  delete legacyPayload.focused;
  expect(validate({ ...context, data: { ...context.data, payload: legacyPayload } })).toBe(true);
  for (const invalid of [{ visibility_state: 'unknown' }, { user_agent: 123 }]) {
    expect(validate({ ...context, data: { ...context.data, payload: { ...context.data.payload, ...invalid } } })).toBe(
      false,
    );
  }
});

test.each(examples.map((event) => [event.data.tag, event] as const))(
  '%s accepts legacy v1 without identity and rejects invalid identity',
  (_tag, event) => {
    const { tab_id: _tab, document_id: _document, ...legacy } = event.data.payload;
    expect(validate({ ...event, data: { ...event.data, payload: legacy } })).toBe(true);
    for (const invalid of [{ tab_id: '' }, { document_id: 42 }]) {
      expect(validate({ ...event, data: { ...event.data, payload: { ...event.data.payload, ...invalid } } })).toBe(
        false,
      );
    }
  },
);

test('visibility accepts legacy state-only events and validates focus observations', () => {
  const event = examples.find((event) => event.data.tag === 'amp-semantic/visibility');
  if (!event) throw new Error('visibility fixture missing');
  expect(validate({ ...event, data: { ...event.data, payload: { v: 1, state: 'hidden' } } })).toBe(true);
  for (const invalid of [{ focused: 'yes' }, { trigger: 'click' }]) {
    expect(validate({ ...event, data: { ...event.data, payload: { ...event.data.payload, ...invalid } } })).toBe(false);
  }
});
