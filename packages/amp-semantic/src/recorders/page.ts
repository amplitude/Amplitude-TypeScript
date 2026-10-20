import type { Cleanup, NavigationReason, RecorderContext, SemanticPayloads, SemanticRecorder } from '../types';

const CONTROLS =
  'a[href],button,input,select,textarea,[role="button"],[role="link"],[role="tab"],[role="menuitem"],[role="option"],[role="checkbox"],[role="switch"]';
const CONTENT = 'h1,h2,h3,h4,h5,h6,[role="heading"],p,li,pre,blockquote,dd,dt,[role="paragraph"],div';
const LOADING = '[aria-busy="true"],[role="progressbar"],.spinner,.skeleton,.loader,.loading,.shimmer';

/** Page-wide work runs outside input handlers and stops after an eight millisecond budget. */
function scan(context: RecorderContext): Pick<SemanticPayloads['page'], 'controls' | 'empty' | 'loading'> {
  const { document, window } = context.host;
  const { helpers } = context;
  const started = window.performance.now();
  const withinBudget = () => window.performance.now() - started < 8;
  const main = document.querySelector('main,[role="main"]') ?? document.body;
  let controls = 0;
  let content = 0;
  let loading = false;
  const seen = new Set<Element>();
  const controlsList = document.querySelectorAll(CONTROLS);
  for (let index = 0; index < controlsList.length; index++) {
    const element = controlsList[index];
    if (!withinBudget() || controls >= 200) break;
    if (!helpers.blocked(element) && helpers.visible(element)) {
      controls++;
      if (main?.contains(element)) {
        content++;
        seen.add(element);
      }
    }
  }
  if (main && content < 5 && withinBudget()) {
    const contentList = main.querySelectorAll(CONTENT);
    for (let index = 0; index < contentList.length; index++) {
      const element = contentList[index];
      if (!withinBudget() || content >= 5) break;
      if (seen.has(element) || helpers.blocked(element) || !helpers.visible(element)) continue;
      const heading = element.matches('h1,h2,h3,h4,h5,h6,[role="heading"]');
      // Count leaf divs as text blocks, not every ancestor of the same paragraph.
      if (element.tagName === 'DIV' && element.children.length > 0) continue;
      if (heading || (element.textContent ?? '').trim().length >= 20) content++;
    }
  }
  if (withinBudget()) {
    const loadingList = document.querySelectorAll(LOADING);
    for (let index = 0; index < loadingList.length; index++) {
      const element = loadingList[index];
      if (!withinBudget()) break;
      if (!helpers.blocked(element) && helpers.visible(element)) {
        loading = true;
        break;
      }
    }
  }
  return { controls, empty: content < 5, loading };
}

export const pageRecorder: SemanticRecorder = {
  families: ['page'],
  setup(context) {
    if (!context.enabled('page')) return () => undefined;
    const { host, helpers } = context;
    const { window, document } = host;
    const cleanups: Cleanup[] = [];
    const timers = new Set<number>();
    const idleCallbacks = new Set<number>();
    let active = true;
    let initialized = context.hasSnapshot?.() ?? false;
    let generation = 0;
    let lastUrl = host.getUrl();
    let lastTitle = document.title;
    const cancelPending = () => {
      generation++;
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
      idleCallbacks.forEach((callback) => window.cancelIdleCallback?.(callback));
      idleCallbacks.clear();
    };
    const later = (callback: () => void, delay: number) => {
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        if (active) callback();
      }, delay);
      timers.add(timer);
      return timer;
    };
    const idle = (callback: () => void) => {
      if (typeof window.requestIdleCallback === 'function') {
        const id = window.requestIdleCallback(
          () => {
            idleCallbacks.delete(id);
            if (active) callback();
          },
          { timeout: 1000 },
        );
        idleCallbacks.add(id);
      } else later(callback, 0);
    };
    const changed = (nav: NavigationReason) => {
      if (!active || !initialized) return;
      cancelPending();
      lastUrl = host.getUrl();
      lastTitle = document.title;
      const current = generation;
      const check = (phase: SemanticPayloads['page']['check']) =>
        idle(() => {
          if (generation !== current) return;
          const facts = scan(context);
          const title = document.querySelector('title');
          context.emit('page', {
            ...facts,
            url: helpers.url(),
            title: title ? helpers.text(title, document.title, 80) : null,
            heading: helpers.heading(),
            nav,
            check: phase,
          });
          if (phase === '2s' && !facts.loading && !facts.empty) {
            window.clearTimeout(fiveSecondTimer);
            timers.delete(fiveSecondTimer);
          }
        });
      check('change');
      later(() => check('2s'), 2000);
      const fiveSecondTimer = later(() => check('5s'), 5000);
    };
    cleanups.push(
      context.on('snapshot', () => {
        if (initialized) return;
        initialized = true;
        changed('load');
      }),
    );
    cleanups.push(context.on('navigation', (reason) => changed(reason)));
    if (!host.externalNavigation) {
      for (const method of ['pushState', 'replaceState'] as const) {
        const original = window.history[method];
        const wrapped: History[typeof method] = function (this: History, ...args) {
          original.apply(this, args);
          if (active && host.getUrl() !== lastUrl) changed(method === 'pushState' ? 'push' : 'replace');
        };
        window.history[method] = wrapped;
        cleanups.push(() => {
          if (window.history[method] === wrapped) window.history[method] = original;
        });
      }
      const pop = () => changed('pop');
      const hash = () => {
        if (host.getUrl() !== lastUrl) changed('hash');
      };
      window.addEventListener('popstate', pop);
      window.addEventListener('hashchange', hash);
      cleanups.push(() => {
        window.removeEventListener('popstate', pop);
        window.removeEventListener('hashchange', hash);
      });
    }
    const Observer = document.defaultView?.MutationObserver;
    if (Observer && document.head) {
      const observer = new Observer(() => {
        if (host.getUrl() === lastUrl && document.title !== lastTitle) changed('title');
      });
      // Observe the head so replacing or creating <title> is handled too.
      observer.observe(document.head, { childList: true, subtree: true, characterData: true });
      cleanups.push(() => observer.disconnect());
    }
    return () => {
      active = false;
      cancelPending();
      cleanups.forEach((cleanup) => cleanup());
    };
  },
};
