import type { Cleanup, NavigationReason, RecorderContext, SemanticPayloads, SemanticRecorder } from '../types';

const CONTROLS =
  'a[href],button,input,select,textarea,[role="button"],[role="link"],[role="tab"],[role="menuitem"],[role="option"],[role="checkbox"],[role="switch"]';
const CONTENT = 'h1,h2,h3,h4,h5,h6,[role="heading"],p,li,pre,blockquote,dd,dt,[role="paragraph"],div';
const LOADING = '[aria-busy="true"],[role="progressbar"],.spinner,.skeleton,.loader,.loading,.shimmer';

/** Bound traversal itself, rather than collecting an unbounded selector result first. */
function scan(context: RecorderContext): Pick<SemanticPayloads['page'], 'controls' | 'empty' | 'loading'> {
  const { document, window } = context.host;
  const { helpers } = context;
  const started = window.performance.now();
  let controls = 0;
  let content = 0;
  let loading = false;
  const root = document.body;
  if (!root) return { controls, empty: true, loading };
  let main: Element | null = null;
  const walker = document.createTreeWalker(root, 1);
  let element = walker.nextNode() as Element | null;
  let visited = 0;
  while (element && visited++ < 2000 && window.performance.now() - started < 8) {
    if (helpers.blocked(element)) {
      // Skip an entire blocked subtree without walking its descendants.
      let next = walker.nextSibling();
      while (!next && walker.parentNode() && walker.currentNode !== root) next = walker.nextSibling();
      element = next as Element | null;
      continue;
    }
    if (!main && element.matches('main,[role="main"]')) {
      main = element;
      content = 0;
    }
    const control = controls < 200 && element.matches(CONTROLS);
    const candidate = content < 5 && (main ?? root).contains(element) && element.matches(CONTENT);
    const loader = !loading && element.matches(LOADING);
    if ((control || candidate || loader) && helpers.visible(element)) {
      if (control) {
        controls++;
        if ((main ?? root).contains(element)) content++;
      } else if (candidate && !(element.tagName === 'DIV' && element.children.length)) {
        const heading = element.matches('h1,h2,h3,h4,h5,h6,[role="heading"]');
        const text = document.createTreeWalker(element, 4);
        let length = 0;
        let nodes = 0;
        let node: Node | null;
        while (!heading && length < 20 && nodes++ < 64 && (node = text.nextNode())) {
          length += (node.nodeValue ?? '').trim().length;
        }
        if (heading || length >= 20) content++;
      }
      if (loader) loading = true;
    }
    element = walker.nextNode() as Element | null;
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
      helpers.invalidateHeading?.();
      lastUrl = host.getUrl();
      lastTitle = document.title;
      const current = generation;
      const check = (phase: SemanticPayloads['page']['check']) =>
        idle(() => {
          if (generation !== current) return;
          if (!context.canEmit('page')) return;
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
