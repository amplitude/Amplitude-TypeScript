import { createCapture } from '../src/capture';
import { RecorderContext, SemanticHost, SemanticRecorder } from '../src/types';

describe('capture runtime', () => {
  let host: SemanticHost;
  let context: RecorderContext;
  let setup: jest.Mock;
  let cleanup: jest.Mock;
  let recorder: SemanticRecorder;
  beforeEach(() => {
    host = {
      document,
      window,
      emit: jest.fn(),
      getNodeId: () => 1,
      getPrivacy: () => ({}),
      getUrl: () => location.href,
      sdk: 'test',
      random: jest.fn(() => 0.25),
      now: () => 123,
    };
    cleanup = jest.fn();
    setup = jest.fn((value: RecorderContext) => {
      context = value;
      return cleanup;
    });
    recorder = { families: ['click'], setup };
  });
  test('disabled attaches no recorders and emits nothing', () => {
    const capture = createCapture({ enabled: false }, host, [recorder]);
    capture.start();
    capture.notify('snapshot', undefined);
    capture.stop();
    expect(setup).not.toHaveBeenCalled();
    expect(host.emit).not.toHaveBeenCalled();
    expect(host.random).not.toHaveBeenCalled();
  });
  test('sampling is stable across starts and reset for a new session', () => {
    const capture = createCapture({ enabled: true, sampleRate: 0.1 }, host, [recorder]);
    capture.start();
    capture.stop();
    capture.start();
    expect(setup).not.toHaveBeenCalled();
    expect(host.random).toHaveBeenCalledTimes(1);
    capture.resetSession();
    expect(host.random).toHaveBeenCalledTimes(2);
  });
  test('family toggles tear down listeners without resetting caps', () => {
    const capture = createCapture({ enabled: true }, host, [recorder]);
    capture.start();
    capture.start();
    expect(setup).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 201; i++) context.emit('visibility', { state: 'visible' });
    expect(host.emit).toHaveBeenCalledTimes(200);
    expect(context.dropped()).toEqual({ visibility: 1 });
    capture.updateConfig({ enabled: true, families: { click: false } });
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(setup).toHaveBeenCalledTimes(1);
    capture.updateConfig({ enabled: true });
    expect(context.emit('visibility', { state: 'hidden' })).toBe(false);
    capture.resetSession();
    expect(context.emit('visibility', { state: 'hidden' })).toBe(true);
  });
  test('dispatches signals synchronously and tears down subscriptions', () => {
    const capture = createCapture({ enabled: true }, host, [recorder]);
    capture.start();
    const callback = jest.fn();
    context.on('snapshot', callback);
    capture.notify('snapshot', undefined);
    expect(callback).toHaveBeenCalledTimes(1);
    capture.stop();
    capture.notify('snapshot', undefined);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(context.emit('visibility', { state: 'visible' })).toBe(false);
  });
  test('preserves timestamp and version and isolates host errors', () => {
    host.onError = jest.fn();
    const capture = createCapture({ enabled: true }, host, [recorder]);
    capture.start();
    context.emit('visibility', { state: 'hidden' }, 99);
    expect(host.emit).toHaveBeenCalledWith({ name: 'visibility', payload: { v: 1, state: 'hidden' }, timestamp: 99 });
    host.emit = () => {
      throw new Error('host');
    };
    expect(context.emit('visibility', { state: 'visible' })).toBe(false);
    expect(host.onError).toHaveBeenCalled();
    host.onError = () => {
      throw new Error('diagnostic');
    };
    expect(() => context.emit('visibility', { state: 'visible' })).not.toThrow();
  });
  test('reserves caps before calling a reentrant host emitter', () => {
    const capture = createCapture({ enabled: true }, host, [recorder]);
    capture.start();
    for (let i = 0; i < 199; i++) context.emit('visibility', { state: 'visible' });
    host.emit = jest.fn(() => {
      context.emit('visibility', { state: 'hidden' });
    });
    context.emit('visibility', { state: 'visible' });
    expect(host.emit).toHaveBeenCalledTimes(1);
    expect(context.dropped()).toEqual({ visibility: 1 });
  });
  test('rolls back registered resources when an extension fails during setup', () => {
    host.onError = jest.fn();
    const release = jest.fn();
    const listener = jest.fn();
    const failing: SemanticRecorder = {
      families: ['click'],
      setup: (ctx) => {
        ctx.onCleanup(release);
        ctx.on('snapshot', listener);
        throw new Error('setup failed');
      },
    };
    const capture = createCapture({ enabled: true }, host, [failing, recorder]);
    capture.start();
    capture.notify('snapshot', undefined);
    expect(release).toHaveBeenCalledTimes(1);
    expect(listener).not.toHaveBeenCalled();
    expect(setup).toHaveBeenCalledTimes(1);
    capture.stop();
    expect(release).toHaveBeenCalledTimes(1);
  });
});
