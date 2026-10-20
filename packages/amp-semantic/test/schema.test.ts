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
