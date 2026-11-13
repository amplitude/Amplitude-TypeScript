import Ajv from 'ajv';
import * as schema from '../schema.json';
import { createSemanticCapture, SemanticEvent } from '../src';

const validate = new Ajv().compile(schema);
const wire = (event: SemanticEvent) => ({
  type: 5,
  timestamp: event.timestamp,
  data: { tag: `amp-semantic/${event.name}`, payload: event.payload },
});

test('validates actual context and visibility payloads and rejects unshipped families', () => {
  const visibility = jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  const events: SemanticEvent[] = [];
  const capture = createSemanticCapture(
    { enabled: true },
    {
      document,
      window,
      sdk: 'test',
      getPrivacy: () => ({}),
      emit: (event) => events.push(event),
    },
  );
  capture.start();
  capture.notify('snapshot', undefined);
  visibility.mockReturnValue('hidden');
  document.dispatchEvent(new Event('visibilitychange'));
  capture.stop();
  expect(events.map((event) => event.name)).toEqual(['context', 'visibility']);
  for (const event of events) expect(validate(wire(event))).toBe(true);
  const invalid = wire(events[1]);
  invalid.data.tag = 'amp-semantic/click';
  expect(validate(invalid)).toBe(false);
  invalid.data.tag = 'amp-semantic/visibility';
  invalid.data.payload = { ...invalid.data.payload, document_id: '' };
  expect(validate(invalid)).toBe(false);
});

import * as semantic from '../src';
test('default capture exposes context and skips payload reads after its cap', () => {
  expect(semantic.defaultRecorders).toEqual([semantic.contextRecorder, semantic.visibilityRecorder]);
  const host = { document, window, sdk: 'test', getPrivacy: () => ({}), emit: jest.fn() };
  const capture = semantic.createSemanticCapture({ enabled: true }, host);
  capture.start();
  for (let i = 0; i < semantic.SEMANTIC_CAPS.context; i++) capture.notify('snapshot', undefined);
  const read = jest.spyOn(document, 'styleSheets', 'get');
  capture.notify('snapshot', undefined);
  expect(read).not.toHaveBeenCalled();
  expect(host.emit).toHaveBeenCalledTimes(semantic.SEMANTIC_CAPS.context);
  capture.stop();
});
