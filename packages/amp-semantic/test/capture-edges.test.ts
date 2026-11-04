import * as semantic from '../src';
import { createCapture } from '../src/capture';
import { RecorderContext, SemanticRecorder, recorderContext } from './fixtures';

function runtime() {
  const host = recorderContext().context.host;
  let context!: RecorderContext;
  const cleanup = jest.fn();
  const recorder: SemanticRecorder = {
    families: ['diagnostic'],
    setup: (value) => {
      context = value;
      return cleanup;
    },
  };
  const capture = createCapture({ enabled: true }, host, [recorder]);
  capture.start();
  return { host, capture, context, cleanup };
}

test('exposes an empty runtime and document identity without installing browser listeners', () => {
  const h = recorderContext().context.host;
  const listener = jest.spyOn(document, 'addEventListener');
  expect(semantic.DEFAULT_SEMANTIC_CAP).toBe(200);
  expect(semantic.getDocumentIdentity(document, window).tab_id).toEqual(expect.any(String));
  const capture = semantic.createCapture({ enabled: true }, h, []);
  capture.start();
  capture.notify('snapshot', undefined);
  expect(capture.isActive()).toBe(true);
  expect(listener).not.toHaveBeenCalled();
  expect(h.emit).not.toHaveBeenCalled();
  capture.stop();
});

test.each([0, -1, 2, NaN, Infinity])(
  'rejects invalid or zero sample rate %s without attaching listeners',
  (sampleRate) => {
    const host = recorderContext().context.host;
    const capture = semantic.createCapture({ enabled: true, sampleRate }, host, []);
    capture.start();
    capture.notify('snapshot', undefined);
    expect(capture.isActive()).toBe(false);
    expect(host.emit).not.toHaveBeenCalled();
    capture.stop();
  },
);

test('ignores unknown host signals', () => {
  const { host, capture } = runtime();
  capture.notify('future-signal' as 'snapshot', undefined);
  expect(host.emit).not.toHaveBeenCalled();
  capture.stop();
});

test('tracks snapshot state, explicit subscriptions and fault isolation', () => {
  const { host, capture, context } = runtime();
  expect(context.hasSnapshot()).toBe(false);
  const error = new Error('extension error');
  const bad = context.on('snapshot', () => {
    throw error;
  });
  const listener = jest.fn();
  const remove = context.on('snapshot', listener);
  const subscriber = jest.fn();
  const unsubscribe = context.subscribe(subscriber);
  const badSubscriber = context.subscribe(() => {
    throw error;
  });
  expect(() => capture.notify('snapshot', undefined)).not.toThrow();
  expect(context.hasSnapshot()).toBe(true);
  expect(listener).toHaveBeenCalledTimes(1);
  context.emit('sample', { state: 'hidden' });
  expect(subscriber).toHaveBeenCalledTimes(1);
  host.onError = jest.fn();
  capture.notify('snapshot', undefined);
  expect(host.onError).toHaveBeenCalledWith(error);
  bad();
  remove();
  unsubscribe();
  badSubscriber();
  capture.notify('snapshot', undefined);
  expect(listener).toHaveBeenCalledTimes(2);
  capture.stop();
  expect(context.hasSnapshot()).toBe(false);
  remove();
});

test('isolates failing cleanup and lets recorders acknowledge dropped counts', () => {
  const { capture, context, cleanup } = runtime();
  cleanup.mockImplementation(() => {
    throw new Error('cleanup');
  });
  for (let i = 0; i < 202; i++) context.emit('sample', { state: 'visible' });
  expect(context.dropped()).toEqual({ sample: 2 });
  context.clearDropped();
  expect(context.dropped()).toEqual({});
  expect(() => capture.stop()).not.toThrow();
});

test('supports typed extensions with explicit family budgets', () => {
  type Payloads = { sample: { value: number } };
  const emit = jest.fn();
  const capture = semantic.createCapture<Payloads>(
    { enabled: true },
    { document, window, sdk: 'test', getPrivacy: () => ({}), emit },
    [
      {
        families: ['sample'],
        setup: (context) => {
          context.emit('sample', { value: 1 });
          context.emit('sample', { value: 2 });
          return () => undefined;
        },
      },
    ],
    { sample: 1 },
  );
  capture.start();
  expect(emit).toHaveBeenCalledTimes(1);
  expect(emit).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'sample', payload: expect.objectContaining({ value: 1 }) }),
  );
  capture.stop();
});
