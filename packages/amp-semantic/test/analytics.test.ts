import type { PrivacyConfig } from '@amplitude/session-replay-dom-privacy';
import { createHelpers } from '../src/helpers';
import { analyticsRecorder } from '../src/recorders/analytics';
import type {
  AcceptedAnalyticsEvent,
  RecorderContext,
  SemanticEvent,
  SemanticHost,
  SemanticPayloads,
} from '../src/types';

function harness(privacy: PrivacyConfig = { defaultMaskLevel: 'medium' }) {
  let receiveAnalytics: ((event: AcceptedAnalyticsEvent) => void) | undefined;
  let receiveSemantic: ((event: SemanticEvent) => void) | undefined;
  let enabled = true;
  const output: SemanticPayloads['amp-event'][] = [];
  const host: SemanticHost = {
    window,
    document,
    sdk: 'test',
    emit: () => undefined,
    getNodeId: () => 7,
    getPrivacy: () => privacy,
    getUrl: () => 'https://example.com/current',
  };
  const context: RecorderContext = {
    onCleanup: () => undefined,
    host,
    helpers: createHelpers(host),
    now: () => Date.now(),
    enabled: () => enabled,
    emit: (name, payload) => {
      if (name === 'amp-event') output.push(payload as SemanticPayloads['amp-event']);
      return true;
    },
    on: (_signal, callback) => {
      receiveAnalytics = callback as (event: AcceptedAnalyticsEvent) => void;
      return () => {
        receiveAnalytics = undefined;
      };
    },
    subscribe: (callback) => {
      receiveSemantic = callback;
      return () => {
        receiveSemantic = undefined;
      };
    },
    dropped: () => ({}),
  };
  return {
    context,
    output,
    click: (name: string | null, timestamp = Date.now(), id: number | null = 7) =>
      receiveSemantic?.({
        name: 'click',
        timestamp,
        payload: {
          v: 1,
          tab_id: 'tab-test',
          document_id: 'document-test',
          id,
          role: 'button',
          name,
          name_source: name === null ? 'masked' : 'text',
          container: null,
          states: [],
          visible: true,
          key: null,
          attrs: {},
          url: '/current',
          heading: null,
          keyboard: false,
          modifiers: [],
          trusted: true,
        },
      }),
    send: (
      properties: Record<string, unknown>,
      element?: Element,
      eventType = '[Amplitude] Rage Click',
      insertId?: string,
    ) => receiveAnalytics?.({ eventType, insertId, properties, element }),
    enabled: (value: boolean) => {
      enabled = value;
    },
    assertDetached: () => {
      expect(receiveAnalytics).toBeUndefined();
      expect(receiveSemantic).toBeUndefined();
    },
  };
}

describe('accepted analytics mirroring', () => {
  let cleanup: (() => void) | undefined;
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(10000);
    document.body.innerHTML = '<button>Save</button>';
  });
  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    jest.useRealTimers();
  });

  it('mirrors only allowlisted properties and correlates a recent safely named click', () => {
    const h = harness();
    cleanup = analyticsRecorder.setup(h.context);
    h.click('Save');
    h.send(
      {
        '[Amplitude] Element Text': 'Save',
        '[Amplitude] Element Tag': 'spoofed',
        '[Amplitude] Clicks': 6,
        '[Amplitude] Begin Time': 9000,
        '[Amplitude] End Time': 10000,
        '[Amplitude] Page Path': '/accounts/123?secret=private#secret',
        user_id: 'PRIVATE_USER',
        user_properties: { email: 'PRIVATE_EMAIL' },
        unrelated: 'PRIVATE_VALUE',
      },
      document.querySelector('button') as Element,
      '[Amplitude] Rage Click',
      'insert-1',
    );
    expect(h.output).toEqual([
      {
        event_type: '[Amplitude] Rage Click',
        insert_id: 'insert-1',
        id: 7,
        props: {
          '[Amplitude] Element Text': 'Save',
          '[Amplitude] Element Tag': 'button',
          '[Amplitude] Clicks': 6,
          '[Amplitude] Begin Time': 9000,
          '[Amplitude] End Time': 10000,
          '[Amplitude] Page Path': '/accounts/:id',
        },
      },
    ]);
    expect(JSON.stringify(h.output)).not.toMatch(/PRIVATE/);
  });

  it.each([
    '[Amplitude] Dead Click',
    '[Amplitude] Rage Click',
    '[Amplitude] Error Click',
    '[Amplitude] Thrashed Cursor',
  ])('allows %s only after a host notification', (eventType) => {
    const h = harness();
    cleanup = analyticsRecorder.setup(h.context);
    expect(h.output).toHaveLength(0);
    h.send({}, undefined, eventType);
    expect(h.output[0]).toMatchObject({ event_type: eventType, insert_id: null, id: null });
  });

  it('rejects arbitrary analytics events', () => {
    const h = harness();
    cleanup = analyticsRecorder.setup(h.context);
    h.send({}, undefined, 'Purchase');
    expect(h.output).toHaveLength(0);
  });

  it.each(['light', 'medium', 'conservative'] as const)(
    'keeps replay-masked text private at %s level',
    (defaultMaskLevel) => {
      const h = harness({ defaultMaskLevel });
      cleanup = analyticsRecorder.setup(h.context);
      const button = document.querySelector('button') as Element;
      button.classList.add('amp-mask');
      h.click('PRIVATE');
      h.send({ '[Amplitude] Element Text': 'PRIVATE' }, button);
      expect(h.output[0]).toMatchObject({ id: null, props: { '[Amplitude] Element Text': null } });
      expect(JSON.stringify(h.output)).not.toContain('PRIVATE');
    },
  );

  it('checks masked descendants before accepting raw SDK text', () => {
    document.body.innerHTML = '<button>Visible <span class="amp-mask">PRIVATE_CHILD</span></button>';
    const h = harness();
    cleanup = analyticsRecorder.setup(h.context);
    h.send({ '[Amplitude] Element Text': 'Visible PRIVATE_CHILD' }, document.querySelector('button') as Element);
    expect(h.output[0].props['[Amplitude] Element Text']).toBeNull();
  });
  it('does not authorize unrelated raw text using an unmasked source element', () => {
    const h = harness();
    cleanup = analyticsRecorder.setup(h.context);
    h.send({ '[Amplitude] Element Text': 'PRIVATE_OTHER_SOURCE' }, document.querySelector('button') as Element);
    expect(h.output[0].props['[Amplitude] Element Text']).toBeNull();
  });

  it('never mirrors typed field or contenteditable values even with light masking', () => {
    document.body.innerHTML =
      '<input value="PRIVATE_INPUT"><textarea>PRIVATE_TEXTAREA</textarea><div contenteditable="true">PRIVATE_EDITABLE</div>';
    const h = harness({ defaultMaskLevel: 'light' });
    cleanup = analyticsRecorder.setup(h.context);
    for (const element of Array.from(document.body.children))
      h.send({ '[Amplitude] Element Text': 'PRIVATE_VALUE' }, element);
    expect(h.output).toHaveLength(3);
    expect(h.output.every((event) => event.props['[Amplitude] Element Text'] === null)).toBe(true);
    expect(JSON.stringify(h.output)).not.toContain('PRIVATE');
  });

  it('requires source element context for text and drops blocked elements', () => {
    const h = harness();
    cleanup = analyticsRecorder.setup(h.context);
    h.click('Save');
    h.send({ '[Amplitude] Element Text': 'Save', '[Amplitude] Element Tag': 'BUTTON' });
    expect(h.output[0]).toMatchObject({
      id: null,
      props: { '[Amplitude] Element Text': null, '[Amplitude] Element Tag': 'button' },
    });
    const button = document.querySelector('button') as Element;
    button.classList.add('amp-block');
    h.send({ '[Amplitude] Element Text': 'PRIVATE' }, button);
    expect(h.output).toHaveLength(1);
  });

  it('uses only a matching most recent click within three seconds', () => {
    const h = harness();
    cleanup = analyticsRecorder.setup(h.context);
    const button = document.querySelector('button') as Element;
    h.click('Save', 6999);
    h.send({ '[Amplitude] Element Text': 'Save' }, button);
    h.click('Save', 11000);
    h.send({ '[Amplitude] Element Text': 'Save' }, button);
    h.click('Different');
    h.send({ '[Amplitude] Element Text': 'Save' }, button);
    h.click('Save', 7000);
    h.send({ '[Amplitude] Element Text': 'Save' }, button);
    expect(h.output.map((event) => event.id)).toEqual([null, null, null, 7]);
  });

  it('rejects malformed numeric properties and untrusted tag-shaped text', () => {
    const h = harness();
    cleanup = analyticsRecorder.setup(h.context);
    h.send({
      '[Amplitude] Clicks': NaN,
      '[Amplitude] Begin Time': Infinity,
      '[Amplitude] End Time': 'PRIVATE',
      '[Amplitude] Element Tag': 'PRIVATE DATA',
      '[Amplitude] Element Text': 123,
    });
    expect(h.output[0].props).toEqual({});
  });

  it('rechecks current privacy rather than reusing the previous click name', () => {
    const h = harness();
    cleanup = analyticsRecorder.setup(h.context);
    h.click('Save');
    const button = document.querySelector('button') as Element;
    button.classList.add('amp-mask');
    h.send({ '[Amplitude] Element Text': 'Save' }, button);
    expect(h.output[0]).toMatchObject({ id: null, props: { '[Amplitude] Element Text': null } });
  });

  it('respects family disabling and releases subscriptions during teardown', () => {
    const h = harness();
    h.enabled(false);
    cleanup = analyticsRecorder.setup(h.context);
    h.assertDetached();
    cleanup();
    h.enabled(true);
    cleanup = analyticsRecorder.setup(h.context);
    h.enabled(false);
    h.send({});
    expect(h.output).toHaveLength(0);
    cleanup();
    h.assertDetached();
  });
});
