import { visibilityRecorder } from '../src/recorders/visibility';
import { createSemanticCapture, SemanticEvent } from '../src';

function setup() {
  const events: SemanticEvent[] = [];
  const emit = jest.fn((event: SemanticEvent) => events.push(event));
  const capture = createSemanticCapture(
    { enabled: true },
    { document, window, sdk: 'test', getPrivacy: () => ({}), emit },
    [visibilityRecorder],
  );
  capture.start();
  return { emit, events, cleanup: () => capture.stop() };
}

test('deduplicates visibility changes, ignores focus, and cleans up on stop', () => {
  const visibility = jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  const { emit, events, cleanup } = setup();
  window.dispatchEvent(new Event('blur'));
  window.dispatchEvent(new Event('focus'));
  document.dispatchEvent(new Event('visibilitychange'));
  expect(emit).not.toHaveBeenCalled();
  visibility.mockReturnValue('hidden');
  document.dispatchEvent(new Event('visibilitychange'));
  document.dispatchEvent(new Event('visibilitychange'));
  expect(emit).toHaveBeenCalledTimes(1);
  visibility.mockReturnValue('visible');
  document.dispatchEvent(new Event('visibilitychange'));
  expect(events.map((event) => event.payload)).toEqual([
    expect.objectContaining({ state: 'hidden' }),
    expect.objectContaining({ state: 'visible' }),
  ]);
  expect(events.map((event) => event.name)).toEqual(['visibility', 'visibility']);
  cleanup();
  visibility.mockReturnValue('hidden');
  document.dispatchEvent(new Event('visibilitychange'));
  expect(emit).toHaveBeenCalledTimes(2);
});
