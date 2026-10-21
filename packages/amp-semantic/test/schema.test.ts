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
  expect(validate({ ...context, data: { ...context.data, payload: legacyPayload } })).toBe(true);
  for (const invalid of [{ visibility_state: 'unknown' }, { user_agent: 123 }]) {
    expect(validate({ ...context, data: { ...context.data, payload: { ...context.data.payload, ...invalid } } })).toBe(
      false,
    );
  }
});
