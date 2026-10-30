import * as semantic from '../src';
import { createCapture } from '../src/capture';
import { RecorderContext, SemanticRecorder } from '../src/types';
import { recorderContext } from './fixtures';

function runtime() {
  const host = recorderContext().context.host;
  let context!: RecorderContext;
  const cleanup = jest.fn();
  const recorder: SemanticRecorder = {
    families: ['context'],
    setup: (value) => {
      context = value;
      return cleanup;
    },
  };
  const capture = createCapture({ enabled: true }, host, [recorder]);
  capture.start();
  return { host, capture, context, cleanup };
}

test('exposes the composable public recorders and default runtime', () => {
  expect(semantic.defaultRecorders).toEqual([semantic.contextRecorder, semantic.visibilityRecorder]);
  expect(semantic.SEMANTIC_CAPS.context).toBe(200);
  const h = recorderContext().context.host;
  expect(semantic.getDocumentIdentity(document, window).tab_id).toEqual(expect.any(String));
  const capture = semantic.createSemanticCapture({ enabled: true }, h);
  capture.start();
  expect(capture.isActive()).toBe(true);
  capture.stop();
});

test.each([0, -1, 2, NaN, Infinity])(
  'rejects invalid or zero sample rate %s without attaching listeners',
  (sampleRate) => {
    const host = recorderContext().context.host;
    const capture = semantic.createSemanticCapture({ enabled: true, sampleRate }, host);
    capture.start();
    capture.notify('snapshot', undefined);
    expect(capture.isActive()).toBe(false);
    expect(host.emit).not.toHaveBeenCalled();
    capture.stop();
  },
);

test('ignores unknown host signals and avoids context payload reads after its cap', () => {
  const host = recorderContext().context.host;
  const capture = semantic.createSemanticCapture({ enabled: true }, host);
  capture.start();
  // JavaScript hosts can send signals that this release does not implement.
  capture.notify('future-signal' as 'snapshot', undefined);
  expect(host.emit).not.toHaveBeenCalled();
  for (let i = 0; i < semantic.SEMANTIC_CAPS.context; i++) capture.notify('snapshot', undefined);
  const read = jest.spyOn(document, 'styleSheets', 'get');
  capture.notify('snapshot', undefined);
  expect(read).not.toHaveBeenCalled();
  expect(host.emit).toHaveBeenCalledTimes(semantic.SEMANTIC_CAPS.context);
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
  context.emit('visibility', { state: 'hidden' });
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

test('isolates failing cleanup and clears cap diagnostics only after a successful context event', () => {
  const { host, capture, context, cleanup } = runtime();
  cleanup.mockImplementation(() => {
    throw new Error('cleanup');
  });
  for (let i = 0; i < 202; i++) context.emit('visibility', { state: 'visible' });
  expect(context.dropped()).toEqual({ visibility: 2 });
  const stop = semantic.contextRecorder.setup(context);
  capture.notify('snapshot', undefined);
  expect(context.dropped()).toEqual({});
  expect(host.emit).toHaveBeenCalledWith(expect.objectContaining({ name: 'context' }));
  stop();
  expect(() => capture.stop()).not.toThrow();
});
