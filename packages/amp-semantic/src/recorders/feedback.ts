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
      if (!active || !element.isConnected || helpers.blocked(element) || !element.textContent?.trim()) return;
      const role = element.getAttribute('role');
      const container = helpers.container(element);
      context.emit('notice', {
        id: helpers.id(element),
        role: role === 'alert' || role === 'status' || role === 'log' ? role : 'live',
        text: helpers.text(element, undefined, 200),
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
          name: description.name,
          state: open ? 'open' : 'closed',
          modal: !element.isConnected && previous ? previous.payload.modal : modal,
          visible: open && helpers.visible(element),
          cause_click_ts: cause(),
        },
      };
    };
    const flush = () => {
      frame = undefined;
      if (!active) return;
      for (const element of pendingNotices) {
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
      pendingNotices.clear();
      for (const element of pendingDialogs) {
        if (helpers.blocked(element)) continue;
        const previous = dialogStates.get(element);
        const current = readDialog(element);
        dialogStates.set(element, current);
        if ((previous && previous.open !== current.open) || (!previous && current.open))
          context.emit('dialog', current.payload);
      }
      pendingDialogs.clear();
    };
    const schedule = () => {
      if (frame !== undefined) return;
      fallbackFrame = typeof window.requestAnimationFrame !== 'function';
      frame = fallbackFrame ? window.setTimeout(flush, 16) : window.requestAnimationFrame(flush);
    };
    const collect = (node: Node, descendants: boolean, changedText = true) => {
      const element = node.nodeType === 1 ? (node as Element) : node.parentElement;
      if (!element) return;
      if (notices && changedText) {
        const region = element.closest(LIVE);
        if (region) pendingNotices.add(region);
        if (descendants) element.querySelectorAll(LIVE).forEach((nested) => pendingNotices.add(nested));
      }
      if (dialogs) {
        if (element.matches(DIALOG)) pendingDialogs.add(element);
        if (descendants) element.querySelectorAll(DIALOG).forEach((nested) => pendingDialogs.add(nested));
      }
    };
    if (dialogs)
      document.body.querySelectorAll(DIALOG).forEach((element) => {
        if (!helpers.blocked(element)) dialogStates.set(element, readDialog(element));
      });
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
      if (pendingNotices.size || pendingDialogs.size) schedule();
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
      pendingNotices.clear();
      pendingDialogs.clear();
    };
  },
};
