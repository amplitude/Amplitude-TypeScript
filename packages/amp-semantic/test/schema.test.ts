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

test('schema permits unbounded unmasked field values and rejects masked values and unknown versions', () => {
  const field = examples.find((event) => event.data.tag === 'amp-semantic/field');
  if (!field) throw new Error('field fixture missing');
  expect(
    validate({ ...field, data: { ...field.data, payload: { ...field.data.payload, masked: true, value: 'private' } } }),
  ).toBe(false);
  for (const value of ['', 'public'.repeat(2000)]) {
    expect(
      validate({ ...field, data: { ...field.data, payload: { ...field.data.payload, masked: false, value } } }),
    ).toBe(true);
  }
  expect(
    validate({ ...field, data: { ...field.data, payload: { ...field.data.payload, masked: false, value: 42 } } }),
  ).toBe(false);
  expect(validate({ ...field, data: { ...field.data, payload: { ...field.data.payload, v: 2 } } })).toBe(false);
});

test('schema accepts additive interaction states and optional boolean checked', () => {
  const click = examples.find((event) => event.data.tag === 'amp-semantic/click');
  const field = examples.find((event) => event.data.tag === 'amp-semantic/field');
  if (!click || !field) throw new Error('interaction fixtures missing');
  expect(
    validate({
      ...click,
      data: { ...click.data, payload: { ...click.data.payload, states: ['mixed', 'busy', 'open'] } },
    }),
  ).toBe(true);
  for (const checked of [true, false]) {
    expect(
      validate({ ...field, data: { ...field.data, payload: { ...field.data.payload, kind: 'checkbox', checked } } }),
    ).toBe(true);
  }
  for (const checked of ['false', 0, null]) {
    expect(validate({ ...field, data: { ...field.data, payload: { ...field.data.payload, checked } } })).toBe(false);
  }
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

test('new family schemas reject typed keys, verbose resource fields, and invalid counts', () => {
  const keys = examples.find((event) => event.data.tag === 'amp-semantic/keys');
  const resource = examples.find((event) => event.data.tag === 'amp-semantic/resource-error');
  if (!keys || !resource) throw new Error('new family fixtures missing');
  for (const key of ['a', 'PRIVATE', 'Ctrl+S', 'Alt+k', 'Dead']) {
    expect(validate({ ...keys, data: { ...keys.data, payload: { ...keys.data.payload, key } } })).toBe(false);
  }
  for (const update of [
    { rt: 'xhr' },
    { kind: 'img' },
    { resource_type: 'img' },
    { count: 0 },
    { count: 1.5 },
    { count: 65536 },
    { path: '/image.png?secret=value' },
    { path: 'https://example.com/image.png' },
  ]) {
    expect(
      validate({ ...resource, data: { ...resource.data, payload: { ...resource.data.payload, ...update } } }),
    ).toBe(false);
  }
});
