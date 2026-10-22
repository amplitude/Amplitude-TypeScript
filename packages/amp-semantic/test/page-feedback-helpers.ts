/* eslint-disable no-restricted-globals -- Shared jsdom test fixture. */
import type {
  HostSignals,
  RecorderContext,
  SemanticEvent,
  SemanticFamily,
  SemanticHelpers,
  SemanticPayloads,
} from '../src/types';

export function recorderContext(disabled: SemanticFamily[] = []) {
  const signals = new Map<string, (value: any) => void>();
  const subscribers = new Set<(event: SemanticEvent) => void>();
  const ids = new WeakMap<Element, number>();
  let nextId = 1;
  const helpers: SemanticHelpers = {
    id: (element) => {
      if (!ids.has(element)) ids.set(element, nextId++);
      return ids.get(element)!;
    },
    blocked: (element) => !!element.closest('.amp-block'),
    masked: (element) => !!element.closest('.amp-mask'),
    text: (element, value, limit = 80) => {
      if (element.closest('.amp-mask') || element.querySelector('.amp-mask')) return null;
      return (value ?? element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
    },
    name: (element) => ({ name: helpers.text(element, element.getAttribute('aria-label')), source: 'text' }),
    role: (element) => element.getAttribute('role') ?? element.tagName.toLowerCase(),
    states: () => [],
    describe: (element) => ({
      id: helpers.id(element),
      role: helpers.role(element),
      name: helpers.name(element).name,
      name_source: 'text',
    }),
    actionable: (element) => element,
    container: () => null,
    visible: (element) => !element.closest('[hidden]'),
    heading: () => {
      const element = document.querySelector('h1');
      return element ? helpers.text(element) : null;
    },
    url: () => window.location.pathname,
    attributes: () => ({}),
  };
  const emit = jest.fn<boolean, [SemanticFamily, SemanticPayloads[SemanticFamily]]>(() => true);
  const context: RecorderContext = {
    onCleanup: () => undefined,
    canEmit: () => true,
    hasCapacity: (family) => !disabled.includes(family) && context.canEmit(family),
    host: {
      document,
      window,
      emit: jest.fn(),
      getNodeId: () => 1,
      getPrivacy: () => ({}),
      getUrl: () => window.location.href,
      sdk: 'test',
    },
    helpers,
    now: () => Date.now(),
    enabled: (family) => !disabled.includes(family),
    emit,
    on: (signal, callback) => {
      signals.set(signal, callback);
      return () => {
        signals.delete(signal);
      };
    },
    subscribe: (callback) => {
      subscribers.add(callback);
      return () => {
        subscribers.delete(callback);
      };
    },
    dropped: () => ({}),
  };
  return {
    context,
    emit,
    signal: <K extends keyof HostSignals>(name: K, value: HostSignals[K]) => signals.get(name)?.(value),
    click: (timestamp: number) =>
      subscribers.forEach((callback) => callback({ name: 'click', timestamp } as SemanticEvent)),
  };
}
