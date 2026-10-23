import { createCapture, SEMANTIC_CAPS } from '../src/capture';
import { urlTemplate } from '../src/helpers';
import { navigationRecorder } from '../src/recorders/navigation';
import { recorderContext } from './page-feedback-helpers';

test('templates accepted URL observations, strips queries and preserves observation time', () => {
  const fixture = recorderContext();
  fixture.context.helpers.url = jest.fn((url) => urlTemplate(url!));
  const emit = jest.spyOn(fixture.context, 'emit');
  const cleanup = navigationRecorder.setup(fixture.context);
  fixture.signal('url', {
    url: 'https://example.com/accounts/8812?secret=hidden#/billing/4321?token=private',
    timestamp: 123,
  });
  expect(emit).toHaveBeenCalledWith('navigation', { url: '/accounts/:id#/billing/:id' }, 123);
  fixture.signal('url', { url: '/accounts/9923?other=secret#/billing/4321', timestamp: 456 });
  // Different navigations can have the same template; preserve their boundaries.
  expect(emit).toHaveBeenLastCalledWith('navigation', { url: '/accounts/:id#/billing/:id' }, 456);
  fixture.signal('url', { url: '', timestamp: 789 });
  expect(emit).toHaveBeenCalledTimes(2);
  cleanup();
  fixture.signal('url', { url: '/after-stop', timestamp: 800 });
  expect(emit).toHaveBeenCalledTimes(2);
});

test('checks capacity before URL processing', () => {
  const fixture = recorderContext();
  fixture.context.canEmit = () => false;
  fixture.context.helpers.url = jest.fn();
  const cleanup = navigationRecorder.setup(fixture.context);
  fixture.signal('url', { url: '/expensive', timestamp: 1 });
  expect(fixture.context.helpers.url).not.toHaveBeenCalled();
  expect(fixture.emit).not.toHaveBeenCalled();
  cleanup();
});

test('honors family switches, sampling, session caps, stop/resume and reset', () => {
  const { context } = recorderContext();
  const output = jest.fn();
  const capture = createCapture(
    { enabled: true, families: { navigation: false } },
    { ...context.host, emit: output, random: () => 0.5 },
    [navigationRecorder],
  );
  capture.start();
  const notify = () => capture.notify('url', { url: '/accounts/123', timestamp: 123 });
  notify();
  expect(output).not.toHaveBeenCalled();
  capture.updateConfig({ enabled: true, sampleRate: 0.1 });
  notify();
  expect(output).not.toHaveBeenCalled();
  capture.updateConfig({ enabled: true });
  for (let i = 0; i < SEMANTIC_CAPS.navigation + 1; i++) notify();
  expect(output).toHaveBeenCalledTimes(SEMANTIC_CAPS.navigation);
  expect(output.mock.calls[0][0]).toEqual(
    expect.objectContaining({
      name: 'navigation',
      timestamp: 123,
      payload: expect.objectContaining({
        v: 1,
        url: '/accounts/:id',
        tab_id: expect.any(String),
        document_id: expect.any(String),
      }),
    }),
  );
  capture.stop();
  notify();
  capture.start();
  notify();
  expect(output).toHaveBeenCalledTimes(SEMANTIC_CAPS.navigation);
  capture.resetSession();
  notify();
  expect(output).toHaveBeenCalledTimes(SEMANTIC_CAPS.navigation + 1);
  capture.stop();
});
