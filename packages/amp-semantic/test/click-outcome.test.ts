import { DEAD_CLICK_MUTATION_OBSERVER_OPTIONS, isDeadClickChange } from '../src/activity';
import { clickOutcomeRecorder } from '../src/recorders/click-outcome';
import type { RecorderContext, SemanticEvent, SemanticPayloads } from '../src/types';

function harness() {
  let subscriber: ((event: SemanticEvent) => void) | undefined;
  let navigation: (() => void) | undefined;
  let url = '/first';
  let frustration = false;
  let enabled = true;
  const output: SemanticPayloads['click-outcome'][] = [];
  const context: RecorderContext = {
    onCleanup: () => undefined,
    canEmit: () => true,
    host: {
      document,
      window,
      sdk: 'test',
      emit: () => undefined,
      getNodeId: () => 1,
      getPrivacy: () => ({ defaultMaskLevel: 'medium' }),
      getUrl: () => url,
      getAnalyticsContext: () => ({ present: true, autocapture: frustration ? ['frustrationInteractions'] : [] }),
    },
    helpers: { url: () => url } as RecorderContext['helpers'],
    now: () => Date.now(),
    enabled: () => enabled,
    emit: (family, payload) => {
      if (family === 'click-outcome') output.push(payload as SemanticPayloads['click-outcome']);
      return true;
    },
    on: (_signal, callback) => {
      navigation = callback as () => void;
      return () => {
        navigation = undefined;
      };
    },
    subscribe: (callback) => {
      subscriber = callback;
      return () => {
        subscriber = undefined;
      };
    },
    dropped: () => ({}),
  };
  const click = (overrides: Partial<SemanticPayloads['click']> = {}) => {
    subscriber?.({
      name: 'click',
      timestamp: Date.now(),
      payload: {
        v: 1,
        tab_id: 'tab-test',
        document_id: 'document-test',
        id: 1,
        role: 'button',
        name: 'Save',
        name_source: 'text',
        container: null,
        states: [],
        visible: true,
        key: 'save',
        attrs: {},
        url,
        heading: null,
        keyboard: false,
        modifiers: [],
        trusted: true,
        ...overrides,
      },
    });
  };
  return {
    context,
    output,
    click,
    send: (event: SemanticEvent) => subscriber?.(event),
    navigate: (nextUrl: string) => {
      url = nextUrl;
      navigation?.();
    },
    frustration: (value: boolean) => {
      frustration = value;
    },
    enabled: (value: boolean) => {
      enabled = value;
    },
    cleanup: () => {
      expect(subscriber).toBeUndefined();
      expect(navigation).toBeUndefined();
    },
  };
}

describe('semantic click outcomes', () => {
  let cleanup: (() => void) | undefined;
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(1000);
    document.body.innerHTML = '<div></div>';
  });
  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    jest.useRealTimers();
  });

  it('shares activity classification and observer options with frustration autocapture', () => {
    expect(['click', 'mutation', 'navigate', 'scroll'].map(isDeadClickChange)).toEqual([false, true, true, false]);
    expect(DEAD_CLICK_MUTATION_OBSERVER_OPTIONS).toEqual({
      childList: true,
      attributes: true,
      characterData: true,
      subtree: true,
    });
  });

  it('disconnects after the first mutation and starts a fresh observer for the next click', async () => {
    const h = harness();
    const disconnect = jest.spyOn(MutationObserver.prototype, 'disconnect');
    const observe = jest.spyOn(MutationObserver.prototype, 'observe');
    cleanup = clickOutcomeRecorder.setup(h.context);
    h.click();
    document.body.appendChild(document.createElement('span'));
    await Promise.resolve();
    expect(disconnect).toHaveBeenCalledTimes(1);
    h.click();
    expect(observe).toHaveBeenCalledTimes(2);
    jest.advanceTimersByTime(1500);
    expect(h.output[0].changed).toBe(true);
    expect(h.output[1].changed).toBe(false);
    disconnect.mockRestore();
    observe.mockRestore();
  });

  it('emits a no-change result only after the observation window', () => {
    const h = harness();
    cleanup = clickOutcomeRecorder.setup(h.context);
    h.click();
    jest.advanceTimersByTime(1499);
    expect(h.output).toHaveLength(0);
    jest.advanceTimersByTime(1);
    expect(h.output).toEqual([
      {
        click_ts: 1000,
        id: 1,
        window_ms: 1500,
        navigated: false,
        changed: false,
        opened: [],
        closed: [],
        error_text: null,
        notice_text: null,
        no_change: true,
        first_change_ms: null,
      },
    ]);
  });

  it('records the first mutation and tracks each overlapping click window', async () => {
    const h = harness();
    cleanup = clickOutcomeRecorder.setup(h.context);
    h.click();
    jest.advanceTimersByTime(100);
    document.body.appendChild(document.createElement('p'));
    await Promise.resolve();
    h.click({ id: 2 });
    jest.advanceTimersByTime(1400);
    expect(h.output[0]).toMatchObject({ changed: true, first_change_ms: 100, no_change: false });
    jest.advanceTimersByTime(100);
    expect(h.output[1]).toMatchObject({ id: 2, changed: false, first_change_ms: null, no_change: true });
  });

  it('drains pre-click mutation records only into already open windows', () => {
    const h = harness();
    cleanup = clickOutcomeRecorder.setup(h.context);
    h.click();
    jest.advanceTimersByTime(100);
    document.body.setAttribute('data-state', 'changed');
    h.click({ id: 2 });
    jest.advanceTimersByTime(1500);
    expect(h.output.map((payload) => payload.changed)).toEqual([true, false]);
  });

  it('marks navigation even when the URL returns before the timer fires', () => {
    const h = harness();
    cleanup = clickOutcomeRecorder.setup(h.context);
    h.click();
    h.navigate('/second');
    h.navigate('/first');
    jest.advanceTimersByTime(1500);
    expect(h.output[0]).toMatchObject({ navigated: true, no_change: false });
  });

  it('includes masked notice text and dialog transitions without inventing categories', () => {
    const h = harness();
    cleanup = clickOutcomeRecorder.setup(h.context);
    h.click();
    h.send({
      name: 'notice',
      timestamp: 1001,
      payload: {
        v: 1,
        tab_id: 'tab-test',
        document_id: 'document-test',
        id: 2,
        role: 'alert',
        text: null,
        visible: true,
        region: null,
        cause_click_ts: 1000,
      },
    });
    h.send({
      name: 'notice',
      timestamp: 1002,
      payload: {
        v: 1,
        tab_id: 'tab-test',
        document_id: 'document-test',
        id: 3,
        role: 'status',
        text: 'Saved',
        visible: true,
        region: null,
        cause_click_ts: 1000,
      },
    });
    h.send({
      name: 'dialog',
      timestamp: 1003,
      payload: {
        v: 1,
        tab_id: 'tab-test',
        document_id: 'document-test',
        id: 4,
        role: 'dialog',
        name: null,
        state: 'open',
        modal: true,
        visible: true,
        cause_click_ts: 1000,
      },
    });
    h.send({
      name: 'dialog',
      timestamp: 1004,
      payload: {
        v: 1,
        tab_id: 'tab-test',
        document_id: 'document-test',
        id: 4,
        role: 'dialog',
        name: null,
        state: 'closed',
        modal: true,
        visible: false,
        cause_click_ts: 1000,
      },
    });
    jest.advanceTimersByTime(1500);
    expect(h.output[0]).toMatchObject({
      error_text: null,
      notice_text: 'Saved',
      opened: [{ role: 'dialog', name: null }],
      closed: [{ role: 'dialog', name: null }],
      no_change: false,
    });
  });

  it('does not observe or emit while frustration capture is enabled', () => {
    const h = harness();
    h.frustration(true);
    const observe = jest.spyOn(MutationObserver.prototype, 'observe');
    cleanup = clickOutcomeRecorder.setup(h.context);
    h.click();
    jest.advanceTimersByTime(1500);
    expect(observe).not.toHaveBeenCalled();
    expect(h.output).toHaveLength(0);
    h.frustration(false);
    h.click();
    jest.advanceTimersByTime(1500);
    expect(h.output).toHaveLength(1);
  });

  it('suppresses a pending fallback when frustration capture becomes enabled', () => {
    const h = harness();
    cleanup = clickOutcomeRecorder.setup(h.context);
    h.click();
    h.frustration(true);
    jest.advanceTimersByTime(1500);
    expect(h.output).toHaveLength(0);
  });

  it('does not duplicate mirrored dead clicks', () => {
    const h = harness();
    cleanup = clickOutcomeRecorder.setup(h.context);
    h.click();
    h.click({ id: 2 });
    h.send({
      name: 'amp-event',
      timestamp: 1200,
      payload: {
        v: 1,
        tab_id: 'tab-test',
        document_id: 'document-test',
        event_type: '[Amplitude] Dead Click',
        insert_id: 'event',
        id: 1,
        props: {},
      },
    });
    jest.advanceTimersByTime(1500);
    expect(h.output).toHaveLength(1);
    expect(h.output[0].id).toBe(2);
  });

  it('ignores modified and new-tab clicks', () => {
    const h = harness();
    cleanup = clickOutcomeRecorder.setup(h.context);
    h.click({ modifiers: ['meta'] });
    h.click({ attrs: { target: '_blank' } });
    jest.advanceTimersByTime(1500);
    expect(h.output).toHaveLength(0);
  });

  it('disconnects observers, subscriptions and timers on teardown', () => {
    const h = harness();
    const disconnect = jest.spyOn(MutationObserver.prototype, 'disconnect');
    cleanup = clickOutcomeRecorder.setup(h.context);
    h.click();
    cleanup();
    expect(disconnect).toHaveBeenCalled();
    h.cleanup();
    jest.advanceTimersByTime(1500);
    expect(h.output).toHaveLength(0);
  });

  it('does not set up disabled families or emit after a runtime kill switch', () => {
    const h = harness();
    h.enabled(false);
    cleanup = clickOutcomeRecorder.setup(h.context);
    h.click();
    expect(jest.getTimerCount()).toBe(0);
    cleanup();
    h.enabled(true);
    cleanup = clickOutcomeRecorder.setup(h.context);
    h.click();
    h.enabled(false);
    jest.advanceTimersByTime(1500);
    expect(h.output).toHaveLength(0);
  });
});
