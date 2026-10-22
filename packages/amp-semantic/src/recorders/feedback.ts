import type { SemanticPayloads, SemanticRecorder } from '../types';
const LIVE = '[role="alert"],[role="status"],[role="log"],[aria-live="polite"],[aria-live="assertive"]';
const DIALOG = 'dialog,[role="dialog"],[role="alertdialog"],[aria-modal="true"]';
type DialogState = { open: boolean; payload: SemanticPayloads['dialog'] };

/** Live regions and dialogs share one observer and one animation-frame batch. */
export const feedbackRecorder: SemanticRecorder = {
  families: ['notice', 'dialog'],
  setup(context) {
    const notices = context.enabled('notice');
    const dialogs = context.enabled('dialog');
    const { host, helpers } = context;
    const { document, window } = host;
    const Observer = document.defaultView?.MutationObserver;
    if ((!notices && !dialogs) || !Observer || !document.body) return () => undefined;
    let active = true;
    let lastClick: number | null = null;
    let frame: number | undefined;
    let fallbackFrame = false;
    // Mutation callbacks only enqueue roots. Discovery and payload work run in
    // bounded batches; overlapping roots are deduplicated before traversal.
    const roots = new Map<Element, number>();
    let scan: { root: Element; flags: number; walker: TreeWalker; node: Element | null } | undefined;
    const pendingNotices = new Set<Element>();
    const pendingDialogs = new Set<Element>();
    const lastNotices = new WeakMap<Element, number>();
    const noticeTimers = new Map<Element, number>();
    const dialogStates = new WeakMap<Element, DialogState>();
    const unsubscribe = context.subscribe((event) => {
      if (event.name === 'click') lastClick = event.timestamp;
    });
    const cause = () =>
      lastClick !== null && context.now() - lastClick >= 0 && context.now() - lastClick <= 3000 ? lastClick : null;
    const sendNotice = (element: Element) => {
      noticeTimers.delete(element);
      if (!active || !element.isConnected || helpers.blocked(element)) return;
      if (!context.canEmit('notice')) return;
      const text = helpers.text(element, undefined, 200);
      if (text !== null && !text.trim()) return;
      const role = element.getAttribute('role');
      const container = helpers.container(element);
      context.emit('notice', {
        id: helpers.id(element),
        role: role === 'alert' || role === 'status' || role === 'log' ? role : 'live',
        text,
        visible: helpers.visible(element),
        region: container ? { role: container.role, name: container.name } : null,
        cause_click_ts: cause(),
      });
      lastNotices.set(element, context.now());
    };
    const readDialog = (element: Element): DialogState => {
      const previous = dialogStates.get(element);
      const open =
        element.isConnected &&
        !element.closest('[hidden],[aria-hidden="true"]') &&
        (element.tagName !== 'DIALOG' || element.hasAttribute('open'));
      let modal = element.getAttribute('aria-modal') === 'true';
      try {
        modal = modal || element.matches(':modal');
      } catch {
        /* Older engines do not support :modal. */
      }
      const description = !element.isConnected && previous ? previous.payload : helpers.describe(element);
      return {
        open,
        payload: {
          id: description.id,
          role: element.getAttribute('role') === 'alertdialog' ? 'alertdialog' : 'dialog',
          // Detachment loses masking ancestors and labelledby sources. Never replay a cached name
          // under a potentially stricter current policy; retain only the node identity.
          name: element.isConnected ? description.name : null,
          state: open ? 'open' : 'closed',
          modal: !element.isConnected && previous ? previous.payload.modal : modal,
          visible: open && helpers.visible(element),
          cause_click_ts: cause(),
        },
      };
    };
    const isOpen = (element: Element) =>
      element.isConnected &&
      !element.closest('[hidden],[aria-hidden="true"]') &&
      (element.tagName !== 'DIALOG' || element.hasAttribute('open'));
    const flush = () => {
      frame = undefined;
      if (!active) return;
      const start = window.performance.now();
      let visited = 0;
      while ((scan || roots.size) && visited < 1000 && window.performance.now() - start < 4) {
        if (!scan) {
          const [root, flags] = roots.entries().next().value as [Element, number];
          roots.delete(root);
          // If a queued ancestor covers this root, let that one visit it once.
          let ancestor = root.parentElement;
          let covered = false;
          while (ancestor) {
            if (((roots.get(ancestor) ?? 0) & flags) === flags) {
              covered = true;
              break;
            }
            ancestor = ancestor.parentElement;
          }
          if (covered) continue;
          scan = { root, flags, walker: document.createTreeWalker(root, 1), node: root };
        }
        const { node, walker, root, flags } = scan;
        if (!node) {
          scan = undefined;
          continue;
        }
        visited++;
        if (((roots.get(node) ?? 0) & flags) === (roots.get(node) ?? 0)) roots.delete(node);
        if (helpers.blocked(node)) {
          // Do not traverse blocked descendants, even to discover their roles.
          if (node === root) {
            scan = undefined;
            continue;
          }
          let next = walker.nextSibling();
          while (!next && walker.parentNode() && walker.currentNode !== root) next = walker.nextSibling();
          scan.node = next as Element | null;
          continue;
        }
        if (flags & 1 && node.matches(LIVE)) pendingNotices.add(node);
        if (flags & 2 && node.matches(DIALOG)) pendingDialogs.add(node);
        scan.node = walker.nextNode() as Element | null;
      }
      // Bound payload work too; large mutation bursts can span multiple frames.
      let processed = 0;
      for (const element of pendingNotices) {
        if (processed++ >= 50 || window.performance.now() - start >= 4) break;
        pendingNotices.delete(element);
        if (noticeTimers.has(element)) continue;
        const last = lastNotices.get(element);
        const remaining = last === undefined ? 0 : 500 - (context.now() - last);
        if (remaining <= 0) sendNotice(element);
        else
          noticeTimers.set(
            element,
            window.setTimeout(() => sendNotice(element), remaining),
          );
      }
      for (const element of pendingDialogs) {
        if (processed++ >= 50 || window.performance.now() - start >= 4) break;
        pendingDialogs.delete(element);
        if (helpers.blocked(element)) continue;
        const previous = dialogStates.get(element);
        const open = isOpen(element);
        if (previous?.open === open || (!previous && !open)) continue;
        if (!context.canEmit('dialog')) {
          // Retain transition state without resolving names/layout after the cap.
          if (previous) dialogStates.set(element, { ...previous, open });
          else
            dialogStates.set(element, {
              open,
              payload: {
                id: null,
                role: 'dialog',
                name: null,
                state: open ? 'open' : 'closed',
                modal: false,
                visible: false,
                cause_click_ts: null,
              },
            });
          continue;
        }
        const current = readDialog(element);
        dialogStates.set(element, current);
        context.emit('dialog', current.payload);
      }
      if (scan || roots.size || pendingNotices.size || pendingDialogs.size) schedule();
    };
    const schedule = () => {
      if (frame !== undefined) return;
      fallbackFrame = typeof window.requestAnimationFrame !== 'function';
      frame = fallbackFrame ? window.setTimeout(flush, 16) : window.requestAnimationFrame(flush);
    };
    const collect = (node: Node, descendants: boolean, changedText = true) => {
      const element = node.nodeType === 1 ? (node as Element) : node.parentElement;
      if (!element || helpers.blocked(element)) return;
      if (notices && changedText) {
        const region = element.closest(LIVE);
        if (region) pendingNotices.add(region);
      }
      if (dialogs && element.matches(DIALOG)) pendingDialogs.add(element);
      if (descendants) {
        const flags = (notices && changedText ? 1 : 0) | (dialogs ? 2 : 0);
        if (flags) roots.set(element, (roots.get(element) ?? 0) | flags);
      }
    };
    // One startup discovery preserves the baseline for existing dialogs. Avoid
    // name and layout extraction here; subsequent discovery is batched above.
    if (dialogs) {
      document.body.querySelectorAll(DIALOG).forEach((element) => {
        if (helpers.blocked(element)) return;
        let modal = element.getAttribute('aria-modal') === 'true';
        try {
          modal = modal || element.matches(':modal');
        } catch {
          /* Older engines. */
        }
        dialogStates.set(element, {
          open: isOpen(element),
          payload: {
            id: helpers.id(element),
            role: 'dialog',
            name: null,
            state: 'closed',
            modal,
            visible: false,
            cause_click_ts: null,
          },
        });
      });
    }
    const observer = new Observer((records) => {
      for (const record of records) {
        if (record.type === 'attributes') {
          if (dialogs) collect(record.target, true, false);
        } else {
          collect(record.target, false);
          record.addedNodes.forEach((node) => collect(node, true));
          if (dialogs) record.removedNodes.forEach((node) => collect(node, true, false));
        }
      }
      if (roots.size || pendingNotices.size || pendingDialogs.size) schedule();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: notices,
      attributes: dialogs,
      ...(dialogs ? { attributeFilter: ['open', 'hidden', 'aria-hidden'] } : {}),
    });
    return () => {
      active = false;
      observer.disconnect();
      unsubscribe();
      if (frame !== undefined) {
        if (fallbackFrame) window.clearTimeout(frame);
        else window.cancelAnimationFrame(frame);
      }
      noticeTimers.forEach((timer) => window.clearTimeout(timer));
      noticeTimers.clear();
      roots.clear();
      scan = undefined;
      pendingNotices.clear();
      pendingDialogs.clear();
    };
  },
};
