import * as semantic from '../src';
import { createCapture } from '../src/capture';
import { RecorderContext, SemanticRecorder } from '../src/types';
import { recorderContext } from './page-feedback-helpers';

function runtime() {
  const host = recorderContext().context.host;
  let context!: RecorderContext;
  const cleanup = jest.fn();
  const recorder: SemanticRecorder = {
    families: ['click'],
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
  expect(semantic.defaultRecorders).toEqual([
    semantic.interactionsRecorder,
    semantic.feedbackRecorder,
    semantic.lifecycleRecorder,
    semantic.navigationRecorder,
    semantic.analyticsRecorder,
    semantic.keysRecorder,
    semantic.resourceErrorRecorder,
  ]);
  expect(semantic.SEMANTIC_CAPS.context).toBe(200);
  const h = recorderContext().context.host;
  expect(semantic.createHelpers(h).role(document.body)).toBe('generic');
  expect(semantic.roleOf(document.createElement('button'))).toBe('button');
  expect(semantic.urlTemplate('/1')).toBe('/:id');
  expect(semantic.getDocumentIdentity(document, window).tab_id).toEqual(expect.any(String));
  const capture = semantic.createSemanticCapture({ enabled: true }, h);
  capture.start();
  expect(capture.isActive()).toBe(true);
  capture.stop();
});

test('tracks snapshot state, explicit subscriptions and fault isolation', () => {
  const { host, capture, context } = runtime();
  expect(context.hasSnapshot!()).toBe(false);
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
  expect(context.hasSnapshot!()).toBe(true);
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
  context.helpers.invalidateHeading = undefined;
  capture.notify('navigation', 'push');
  capture.notify('snapshot', undefined);
  expect(listener).toHaveBeenCalledTimes(2);
  capture.stop();
  expect(context.hasSnapshot!()).toBe(false);
  remove();
});

test('isolates failing cleanup and clears cap diagnostics only after a successful context event', () => {
  const { host, capture, context, cleanup } = runtime();
  cleanup.mockImplementation(() => {
    throw new Error('cleanup');
  });
  for (let i = 0; i < 202; i++) context.emit('visibility', { state: 'visible' });
  expect(context.dropped()).toEqual({ visibility: 2 });
  const stop = semantic.lifecycleRecorder.setup(context);
  capture.notify('snapshot', undefined);
  expect(context.dropped()).toEqual({});
  expect(host.emit).toHaveBeenCalledWith(expect.objectContaining({ name: 'context' }));
  stop();
  expect(() => capture.stop()).not.toThrow();
});
