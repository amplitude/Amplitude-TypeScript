import { DEAD_CLICK_MUTATION_OBSERVER_OPTIONS, isDeadClickChange } from '../activity';
import type { RecorderContext, SemanticEvent, SemanticPayloads, SemanticRecorder } from '../types';

const OUTCOME_WINDOW_MS = 1500;
const MAX_PENDING_OUTCOMES = 1000;
type PendingOutcome = {
  payload: SemanticPayloads['click-outcome'];
  url: string;
  timer: number;
};

const frustrationEnabled = (context: RecorderContext): boolean =>
  context.host.getAnalyticsContext?.().autocapture.includes('frustrationInteractions') ?? false;

/** Fallback facts use the same activity definition as dead-click autocapture. */
export const clickOutcomeRecorder: SemanticRecorder = {
  families: ['click-outcome'],
  setup(context) {
    if (!context.enabled('click-outcome')) return () => undefined;
    const pending = new Set<PendingOutcome>();
    const { host, helpers } = context;
    let observer: MutationObserver | undefined;
    let active = true;

    const disconnectIdleObserver = () => {
      if (pending.size === 0) {
        observer?.disconnect();
        observer = undefined;
      }
    };
    const mutation = (records: MutationRecord[]) => {
      if (!records.length || !isDeadClickChange('mutation')) return;
      const timestamp = context.now();
      for (const outcome of pending) {
        outcome.payload.changed = true;
        if (outcome.payload.first_change_ms === null)
          outcome.payload.first_change_ms = Math.max(0, timestamp - outcome.payload.click_ts);
      }
      // Once every pending window has seen its first mutation, additional
      // mutations cannot change its facts. A later click starts observation again.
      observer?.disconnect();
      observer = undefined;
    };
    const startObserver = (): boolean => {
      if (observer) return true;
      const Observer = host.document.defaultView?.MutationObserver;
      if (!Observer || !host.document.body) return false;
      observer = new Observer(mutation);
      observer.observe(host.document.body, DEAD_CLICK_MUTATION_OBSERVER_OPTIONS);
      return true;
    };
    const cancel = (outcome: PendingOutcome) => {
      host.window.clearTimeout(outcome.timer);
      pending.delete(outcome);
    };
    const navigated = () => {
      if (!isDeadClickChange('navigate')) return;
      const url = helpers.url();
      for (const outcome of pending) {
        if (url !== outcome.url) outcome.payload.navigated = true;
      }
    };
    const observeEvent = (event: SemanticEvent) => {
      if (!active || !context.enabled('click-outcome')) return;
      if (event.name === 'click') {
        if (frustrationEnabled(context) || event.payload.modifiers.length || event.payload.attrs.target === '_blank')
          return;
        if (!context.canEmit('click-outcome')) return;
        // Drain pre-click mutations for older windows before registering this click.
        if (observer) mutation(observer.takeRecords());
        if (pending.size >= MAX_PENDING_OUTCOMES || !startObserver()) return;
        const outcome: PendingOutcome = {
          url: event.payload.url,
          timer: 0,
          payload: {
            click_ts: event.timestamp,
            id: event.payload.id,
            window_ms: OUTCOME_WINDOW_MS,
            navigated: false,
            changed: false,
            opened: [],
            closed: [],
            error_text: null,
            notice_text: null,
            no_change: true,
            first_change_ms: null,
          },
        };
        pending.add(outcome);
        outcome.timer = host.window.setTimeout(() => {
          if (observer) mutation(observer.takeRecords());
          navigated();
          pending.delete(outcome);
          disconnectIdleObserver();
          if (!active || !context.enabled('click-outcome') || frustrationEnabled(context)) return;
          const payload = outcome.payload;
          payload.no_change =
            !payload.navigated && !payload.changed && !payload.opened.length && !payload.closed.length;
          context.emit('click-outcome', payload);
        }, OUTCOME_WINDOW_MS);
      } else if (event.name === 'page') {
        navigated();
      } else if (event.name === 'notice' || event.name === 'dialog') {
        for (const outcome of pending) {
          if (
            event.timestamp < outcome.payload.click_ts ||
            event.timestamp - outcome.payload.click_ts > OUTCOME_WINDOW_MS
          )
            continue;
          if (event.name === 'notice') {
            if (event.payload.role === 'alert') outcome.payload.error_text = event.payload.text;
            else outcome.payload.notice_text = event.payload.text;
          } else {
            const target = event.payload.state === 'open' ? outcome.payload.opened : outcome.payload.closed;
            // Keep payload growth bounded even on animation-heavy pages.
            if (target.length < 20) target.push({ role: event.payload.role, name: event.payload.name });
          }
        }
      } else if (event.name === 'amp-event' && event.payload.event_type === '[Amplitude] Dead Click') {
        // Defend against a host enabling frustration capture while a window is pending.
        for (const outcome of pending) {
          if (event.payload.id === null || event.payload.id === outcome.payload.id) cancel(outcome);
        }
        disconnectIdleObserver();
      }
    };
    const unsubscribe = context.subscribe(observeEvent);
    const stopNavigation = context.on('navigation', navigated);
    return () => {
      active = false;
      unsubscribe();
      stopNavigation();
      for (const outcome of pending) cancel(outcome);
      observer?.disconnect();
      observer = undefined;
    };
  },
};
