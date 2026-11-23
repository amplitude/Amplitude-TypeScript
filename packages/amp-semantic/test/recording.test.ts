import { createSemanticCapture, SemanticEvent } from '../src';
import { recordingRecorder } from '../src/recorders/recording';

test('forwards host recording boundaries and removes the subscription on stop', () => {
  const events: SemanticEvent[] = [];
  const capture = createSemanticCapture(
    { enabled: true },
    { document, window, sdk: 'test', getPrivacy: () => ({}), emit: (event) => events.push(event) },
    [recordingRecorder],
  );
  capture.start();
  capture.notify('recording', { state: 'start', reason: 'init' });
  capture.notify('recording', { state: 'stop', reason: 'customer_stop' });
  expect(events.map((event) => (event.name === 'recording' ? event.payload.state : undefined))).toEqual([
    'start',
    'stop',
  ]);
  capture.stop();
  capture.notify('recording', { state: 'resume', reason: 'focus' });
  expect(events).toHaveLength(2);
});
