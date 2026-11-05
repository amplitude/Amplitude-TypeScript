import { createCapture } from '../src/capture';
import { RecorderContext, SemanticHost, SemanticRecorder } from './fixtures';

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
      getIdentity: jest.fn(() => ({ tab_id: 'tab-test', document_id: 'document-test' })),
      random: jest.fn(() => 0.25),
      now: () => 123,
    };
    cleanup = jest.fn();
    setup = jest.fn((value: RecorderContext) => {
      context = value;
      return cleanup;
    });
    recorder = { families: ['diagnostic'], setup };
  });
  test('disabled attaches no recorders and emits nothing', () => {
    const capture = createCapture({ enabled: false }, host, [recorder]);
    capture.start();
    capture.notify('snapshot', undefined);
    capture.stop();
    expect(setup).not.toHaveBeenCalled();
    expect(host.emit).not.toHaveBeenCalled();
    expect(host.random).not.toHaveBeenCalled();
    expect(host.getIdentity).not.toHaveBeenCalled();
  });
  test('sampling is stable across starts and reset for a new session', () => {
    const capture = createCapture({ enabled: true, sampleRate: 0.1 }, host, [recorder]);
    capture.start();
    capture.stop();
    capture.start();
    expect(setup).not.toHaveBeenCalled();
    expect(host.getIdentity).not.toHaveBeenCalled();
    expect(host.random).toHaveBeenCalledTimes(1);
    capture.resetSession();
    expect(host.random).toHaveBeenCalledTimes(2);
  });
  test('family toggles tear down listeners without resetting caps', () => {
    const capture = createCapture({ enabled: true }, host, [recorder]);
    capture.start();
    capture.start();
    expect(setup).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 201; i++) context.emit('sample', { state: 'visible' });
    expect(host.emit).toHaveBeenCalledTimes(200);
    expect(context.dropped()).toEqual({ sample: 1 });
    capture.updateConfig({ enabled: true, families: { diagnostic: false } });
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(setup).toHaveBeenCalledTimes(1);
    capture.updateConfig({ enabled: true });
    expect(context.emit('sample', { state: 'hidden' })).toBe(false);
    capture.resetSession();
    expect(context.emit('sample', { state: 'hidden' })).toBe(true);
  });
  test('preflight avoids payload work after the cap and counts each dropped candidate once', () => {
    const capture = createCapture({ enabled: true }, host, [recorder]);
    capture.start();
    for (let i = 0; i < 200; i++) context.emit('sample', { state: 'visible' });
    expect(context.dropped()).toEqual({});
    const payload = jest.fn(() => ({ state: 'hidden' as const }));
    if (context.canEmit('sample')) context.emit('sample', payload());
    expect(payload).not.toHaveBeenCalled();
    expect(context.dropped()).toEqual({ sample: 1 });
    capture.stop();
    expect(context.canEmit('sample')).toBe(false);
    expect(context.dropped()).toEqual({ sample: 1 });
    capture.start();
    capture.resetSession();
    expect(context.canEmit('sample')).toBe(true);
    capture.stop();
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
    expect(context.emit('sample', { state: 'visible' })).toBe(false);
  });
  test('preserves timestamp and version and isolates host errors', () => {
    host.onError = jest.fn();
    const capture = createCapture({ enabled: true }, host, [recorder]);
    capture.start();
    context.emit('sample', { state: 'hidden' }, 99);
    expect(host.emit).toHaveBeenCalledWith({
      name: 'sample',
      payload: {
        v: 1,
        state: 'hidden',
        tab_id: 'tab-test',
        document_id: 'document-test',
      },
      timestamp: 99,
    });
    host.emit = () => {
      throw new Error('host');
    };
    expect(context.emit('sample', { state: 'visible' })).toBe(false);
    expect(host.onError).toHaveBeenCalled();
    host.onError = () => {
      throw new Error('diagnostic');
    };
    expect(() => context.emit('sample', { state: 'visible' })).not.toThrow();
  });
  test('restores capacity when the host rejects an event', () => {
    const capture = createCapture({ enabled: true }, host, [recorder], { sample: 1 });
    capture.start();
    const error = new Error('transport failed');
    host.emit = () => {
      throw error;
    };
    host.onError = jest.fn();
    expect(context.emit('sample', { state: 'visible' })).toBe(false);
    expect(host.onError).toHaveBeenCalledWith(error);
    host.emit = jest.fn();
    expect(context.emit('sample', { state: 'hidden' })).toBe(true);
    expect(context.emit('sample', { state: 'visible' })).toBe(false);
    expect(host.emit).toHaveBeenCalledTimes(1);
    capture.stop();
  });
  test('runs a registered cleanup once even when setup returns it', () => {
    const release = jest.fn();
    const recorderWithRegisteredCleanup: SemanticRecorder = {
      families: ['diagnostic'],
      setup: (ctx) => {
        ctx.onCleanup(release);
        return release;
      },
    };
    const capture = createCapture({ enabled: true }, host, [recorderWithRegisteredCleanup]);
    capture.start();
    capture.stop();
    expect(release).toHaveBeenCalledTimes(1);
  });
  test('reserves caps before calling a reentrant host emitter', () => {
    const capture = createCapture({ enabled: true }, host, [recorder]);
    capture.start();
    for (let i = 0; i < 199; i++) context.emit('sample', { state: 'visible' });
    host.emit = jest.fn(() => {
      context.emit('sample', { state: 'hidden' });
    });
    context.emit('sample', { state: 'visible' });
    expect(host.emit).toHaveBeenCalledTimes(1);
    expect(context.dropped()).toEqual({ sample: 1 });
  });
  test('stamps all families centrally and retains document identity through stop and reset', () => {
    host.getIdentity = undefined;
    const capture = createCapture({ enabled: true }, host, [recorder]);
    capture.start();
    context.emit('sample', { state: 'hidden' });
    const first = jest.mocked(host.emit).mock.calls[0][0].payload;
    capture.stop();
    capture.start();
    capture.resetSession();
    context.emit('sample', { state: 'visible' });
    expect(jest.mocked(host.emit).mock.calls[1][0].payload).toMatchObject({
      tab_id: first.tab_id,
      document_id: first.document_id,
    });
    expect(first.tab_id).toEqual(expect.any(String));
    expect(first.document_id).toEqual(expect.any(String));
    capture.stop();
  });

  test('a failed identity provider falls back without dropping events', () => {
    host.getIdentity = () => {
      throw new Error('storage blocked');
    };
    host.onError = jest.fn();
    const capture = createCapture({ enabled: true }, host, [recorder]);
    capture.start();
    expect(context.emit('sample', { state: 'visible' })).toBe(true);
    expect(host.onError).toHaveBeenCalled();
    expect(jest.mocked(host.emit).mock.calls[0][0].payload).toMatchObject({
      tab_id: expect.any(String),
      document_id: expect.any(String),
    });
    capture.stop();
  });

  test('rolls back recorder resources when stop runs during setup', () => {
    const listener = jest.fn();
    const release = jest.fn();
    const reentrant: SemanticRecorder = {
      families: ['diagnostic'],
      setup: (ctx) => {
        ctx.on('snapshot', listener);
        ctx.onCleanup(release);
        host.emit?.({
          name: 'diagnostic',
          payload: { v: 1, tab_id: 't', document_id: 'd' },
          timestamp: 0,
        });
        return () => undefined;
      },
    };
    const capture = createCapture({ enabled: true }, host, [reentrant]);
    let emitCount = 0;
    host.emit = jest.fn(() => {
      if (emitCount++ === 0) capture.stop();
    });
    capture.start();
    expect(listener).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledTimes(1);
    expect(capture.isActive()).toBe(false);
    capture.start();
    capture.notify('snapshot', undefined);
    expect(listener).toHaveBeenCalledTimes(1);
    capture.stop();
    expect(release).toHaveBeenCalledTimes(2);
  });

  test('does not duplicate recorder setup when resetSession runs during setup', () => {
    const firstSetup = jest.fn(() => () => undefined);
    const secondSetup = jest.fn(() => () => undefined);
    const reentrant: SemanticRecorder = {
      families: ['diagnostic'],
      setup: () => {
        firstSetup();
        host.emit?.({
          name: 'diagnostic',
          payload: { v: 1, tab_id: 't', document_id: 'd' },
          timestamp: 0,
        });
        return () => undefined;
      },
    };
    const second: SemanticRecorder = {
      families: ['diagnostic'],
      setup: secondSetup,
    };
    const capture = createCapture({ enabled: true }, host, [reentrant, second]);
    let emitCount = 0;
    host.emit = jest.fn(() => {
      if (emitCount++ === 0) capture.resetSession();
    });
    capture.start();
    expect(firstSetup).toHaveBeenCalledTimes(2);
    expect(secondSetup).toHaveBeenCalledTimes(1);
    expect(capture.isActive()).toBe(true);
    capture.stop();
  });

  test('rolls back registered resources when an extension fails during setup', () => {
    host.onError = jest.fn();
    const release = jest.fn();
    const listener = jest.fn();
    const failing: SemanticRecorder = {
      families: ['diagnostic'],
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
