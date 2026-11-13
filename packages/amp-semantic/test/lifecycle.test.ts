import { createSemanticCapture, SemanticEvent } from '../src';
import { lifecycleRecorder } from '../src/recorders/lifecycle';

test('emits browser boundaries including BFCache restore and cleans up on stop', () => {
  const events: SemanticEvent[] = [];
  const capture = createSemanticCapture(
    { enabled: true },
    { document, window, sdk: 'test', getPrivacy: () => ({}), emit: (event) => events.push(event) },
    [lifecycleRecorder],
  );
  capture.start();
  window.dispatchEvent(new Event('pagehide'));
  window.dispatchEvent(new Event('pageshow'));
  const restored = new Event('pageshow');
  Object.defineProperty(restored, 'persisted', { value: true });
  window.dispatchEvent(restored);
  document.dispatchEvent(new Event('freeze'));
  document.dispatchEvent(new Event('resume'));
  expect(events.map((event) => (event.name === 'lifecycle' ? event.payload.type : undefined))).toEqual([
    'pagehide',
    'pageshow',
    'pageshow_bfcache',
    'freeze',
    'resume',
  ]);
  capture.stop();
  window.dispatchEvent(new Event('pagehide'));
  expect(events).toHaveLength(5);
});
