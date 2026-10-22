import type { SemanticPayloads, SemanticRecorder } from '../types';
const LIVE = '[role="alert"],[role="status"],[role="log"],[aria-live="polite"],[aria-live="assertive"]';
const DIALOG = 'dialog,[role="dialog"],[role="alertdialog"],[aria-modal="true"]';
const MAX_ROOTS = 128;
const MAX_PENDING = 256;
const MAX_MUTATIONS = 1000;
const FRAME_MS = 4;
const DELIVERY_MS = 2;
const MAX_PAYLOADS = 50;
type DialogState = { open: boolean; payload: SemanticPayloads['dialog'] };

/** Live regions and dialogs share one observer and one animation-frame batch. */
export const feedbackRecorder: SemanticRecorder = {
  families: ['notice', 'dialog'],
  setup(context) {
    let notices = context.hasCapacity('notice');
    let dialogs = context.hasCapacity('dialog');
    const { host, helpers } = context;
    const { document, window } = host;
    const Observer = document.defaultView?.MutationObserver;
    if ((!notices && !dialogs) || !Observer || !document.body) return () => undefined;
    let active = true;
    let lastClick: number | null = null;
    let frame: number | undefined;
    let fallbackFrame = false;
    // Bound retained elements as well as per-frame work. Overflow is lossy and
    // reported once per queue through the existing host diagnostics channel.
    let generation = 0;
    const roots = new Map<Element, { flags: number; generation: number }>();
    let scan:
      | { root: Element; flags: number; generation: number; walker: TreeWalker; node: Element | null }
      | undefined;
    const pendingNotices = new Set<Element>();
    const pendingDialogs = new Set<Element>();
    const lastNotices = new WeakMap<Element, number>();
    const seenNotices = new WeakMap<Element, number>();
    const noticeTimers = new Map<Element, number>();
    const dialogStates = new WeakMap<Element, DialogState>();
    const openDialogs = new Set<Element>();
    const overflows = new Set<string>();
    let checkDetached = false;
    let nextDialog = false;
    const overflow = (queue: string) => {
      if (overflows.has(queue)) return;
      overflows.add(queue);
      try {
        host.onError?.(new Error(`Semantic feedback ${queue} limit reached; some changes may be omitted.`));
      } catch {
        /* Diagnostics must not affect the page. */
      }
    };
    const enqueueNotice = (element: Element, discoveredGeneration?: number) => {
      if (!notices || !element.isConnected) return;
      if (discoveredGeneration !== undefined && (seenNotices.get(element) ?? -1) >= discoveredGeneration) return;
      if (!pendingNotices.has(element) && !noticeTimers.has(element)) {
        if (pendingNotices.size + noticeTimers.size >= MAX_PENDING) {
          overflow('notice queue');
          return;
        }
        pendingNotices.add(element);
      }
      // Direct mutation intake and later subtree discovery can see the same
      // region. Do not emit it twice for the same mutation batch.
      if (discoveredGeneration !== undefined) seenNotices.set(element, discoveredGeneration);
    };
    const enqueueDialog = (element: Element) => {
      if (!dialogs || pendingDialogs.has(element)) return;
      if (pendingDialogs.size >= MAX_PENDING) {
        overflow('dialog queue');
        if (!element.isConnected && openDialogs.has(element)) checkDetached = true;
      } else pendingDialogs.add(element);
    };
    const unsubscribe = context.subscribe((event) => {
      if (event.name === 'click') lastClick = event.timestamp;
    });
    const cause = () =>
      lastClick !== null && context.now() - lastClick >= 0 && context.now() - lastClick <= 3000 ? lastClick : null;
    const sendNotice = (element: Element) => {
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
          name_source: element.isConnected ? description.name_source : 'masked',
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
    const clearNotices = () => {
      pendingNotices.clear();
      noticeTimers.forEach((timer) => window.clearTimeout(timer));
      noticeTimers.clear();
    };
    const cancelFrame = () => {
      if (frame === undefined) return;
      if (fallbackFrame) window.clearTimeout(frame);
      else window.cancelAnimationFrame(frame);
      frame = undefined;
    };
    const cleanup = () => {
      active = false;
      observer.disconnect();
      unsubscribe();
      cancelFrame();
      clearNotices();
      roots.clear();
      scan = undefined;
      pendingDialogs.clear();
      openDialogs.clear();
    };
    const refreshCapacity = () => {
      if (notices && !context.hasCapacity('notice')) {
        notices = false;
        clearNotices();
      }
      if (dialogs && !context.hasCapacity('dialog')) {
        dialogs = false;
        pendingDialogs.clear();
        openDialogs.clear();
      }
      if (!notices && !dialogs) cleanup();
      return active;
    };
    const processNotice = (element: Element) => {
      pendingNotices.delete(element);
      if (!element.isConnected || noticeTimers.has(element)) return;
      const last = lastNotices.get(element);
      const remaining = last === undefined ? 0 : 500 - (context.now() - last);
      if (remaining <= 0) sendNotice(element);
      else {
        // A trailing timer only transfers its slot back to the ready queue.
        // Text/name/layout work always runs inside the shared frame budget.
        noticeTimers.set(
          element,
          window.setTimeout(() => {
            noticeTimers.delete(element);
            if (!active || !notices) return;
            enqueueNotice(element);
            if (pendingNotices.size) schedule();
          }, remaining),
        );
      }
    };
    const processDialog = (element: Element) => {
      pendingDialogs.delete(element);
      if (helpers.blocked(element)) {
        openDialogs.delete(element);
        return;
      }
      const previous = dialogStates.get(element);
      const open = isOpen(element);
      if (previous?.open === open || (!previous && !open)) return;
      if (open && !openDialogs.has(element) && openDialogs.size >= MAX_PENDING) {
        overflow('open dialog tracking');
        return;
      }
      const current = readDialog(element);
      dialogStates.set(element, current);
      if (open) openDialogs.add(element);
      else openDialogs.delete(element);
      context.emit('dialog', current.payload);
    };
    const flush = () => {
      frame = undefined;
      if (!active || !refreshCapacity()) return;
      const start = window.performance.now();
      if (checkDetached) {
        checkDetached = false;
        // This set is bounded. Never traverse a detached subtree for discovery.
        for (const element of openDialogs) {
          if (!element.isConnected) enqueueDialog(element);
        }
        for (const element of pendingNotices) {
          if (!element.isConnected) pendingNotices.delete(element);
        }
        for (const [element, timer] of noticeTimers) {
          if (!element.isConnected) {
            window.clearTimeout(timer);
            noticeTimers.delete(element);
          }
        }
        for (const root of roots.keys()) {
          if (!root.isConnected) roots.delete(root);
        }
        if (scan && !scan.root.isConnected) scan = undefined;
      }
      let processed = 0;
      const deliver = (deadline: number) => {
        while (
          active &&
          (pendingNotices.size || pendingDialogs.size) &&
          processed < MAX_PAYLOADS &&
          window.performance.now() < deadline
        ) {
          const useDialog = pendingDialogs.size > 0 && (nextDialog || !pendingNotices.size);
          nextDialog = !useDialog;
          processed++;
          if (useDialog) processDialog(pendingDialogs.values().next().value as Element);
          else processNotice(pendingNotices.values().next().value as Element);
          refreshCapacity();
        }
      };
      // Ready events have first access to the frame. Alternate families across
      // frames too, so an expensive notice cannot repeatedly starve a dialog.
      deliver(start + DELIVERY_MS);
      let visited = 0;
      while (active && (scan || roots.size) && visited < 1000 && window.performance.now() - start < FRAME_MS) {
        if (!scan) {
          const [root, entry] = roots.entries().next().value as [Element, { flags: number; generation: number }];
          const flags = entry.flags & ((notices ? 1 : 0) | (dialogs ? 2 : 0));
          roots.delete(root);
          if (!root.isConnected || !flags) continue;
          let ancestor = root.parentElement;
          let covered = false;
          while (ancestor) {
            if (((roots.get(ancestor)?.flags ?? 0) & flags) === flags) {
              covered = true;
              break;
            }
            ancestor = ancestor.parentElement;
          }
          if (covered) continue;
          scan = { root, flags, generation: entry.generation, walker: document.createTreeWalker(root, 1), node: root };
        }
        const { node, walker, root, flags, generation: scanGeneration } = scan;
        if (!node || !root.isConnected || !(flags & ((notices ? 1 : 0) | (dialogs ? 2 : 0)))) {
          scan = undefined;
          continue;
        }
        visited++;
        // DOM mutations can detach the walker's cursor between frames.
        if (!node.isConnected || !root.contains(node)) {
          // Restart discovery from this still-connected root. Retained
          // work remains bounded, and known notices are generation-deduplicated.
          if (roots.has(root) || roots.size < MAX_ROOTS) {
            const queued = roots.get(root);
            roots.set(root, { flags: flags | (queued?.flags ?? 0), generation: queued?.generation ?? scanGeneration });
          } else overflow('discovery queue');
          scan = undefined;
          continue;
        }
        if (
          (roots.get(node)?.generation ?? -1) <= scanGeneration &&
          ((roots.get(node)?.flags ?? 0) & flags) === (roots.get(node)?.flags ?? 0)
        )
          roots.delete(node);
        if (helpers.blocked(node)) {
          if (node === root) {
            scan = undefined;
            continue;
          }
          let next = walker.nextSibling();
          while (!next && walker.parentNode() && walker.currentNode !== root) next = walker.nextSibling();
          scan.node = next as Element | null;
          continue;
        }
        if (notices && flags & 1 && node.matches(LIVE)) enqueueNotice(node, scanGeneration);
        if (dialogs && flags & 2 && node.matches(DIALOG)) enqueueDialog(node);
        scan.node = walker.nextNode() as Element | null;
      }
      deliver(start + FRAME_MS);
      if (active && (checkDetached || scan || roots.size || pendingNotices.size || pendingDialogs.size)) schedule();
    };
    const schedule = () => {
      if (!active || frame !== undefined) return;
      fallbackFrame = typeof window.requestAnimationFrame !== 'function';
      frame = fallbackFrame ? window.setTimeout(flush, 16) : window.requestAnimationFrame(flush);
    };
    const collect = (node: Node, descendants: boolean, changedText = true) => {
      const element = node.nodeType === 1 ? (node as Element) : node.parentElement;
      if (!element || !element.isConnected || helpers.blocked(element)) return;
      if (notices && changedText) {
        const region = element.closest(LIVE);
        if (region) enqueueNotice(region, generation);
      }
      if (dialogs && element.matches(DIALOG)) enqueueDialog(element);
      if (descendants) {
        const flags = (notices && changedText ? 1 : 0) | (dialogs ? 2 : 0);
        if (flags) {
          if (!roots.has(element) && roots.size >= MAX_ROOTS) overflow('discovery queue');
          else roots.set(element, { flags: (roots.get(element)?.flags ?? 0) | flags, generation });
        }
      }
    };
    // One startup discovery preserves the baseline for existing dialogs. Avoid
    // name and layout extraction here; subsequent discovery is batched above.
    if (dialogs) {
      for (const element of Array.from(document.body.querySelectorAll(DIALOG))) {
        if (helpers.blocked(element) || !isOpen(element)) continue;
        if (openDialogs.size >= MAX_PENDING) {
          overflow('open dialog tracking');
          break;
        }
        openDialogs.add(element);
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
            name_source: 'unnamed',
            state: 'open',
            modal,
            visible: false,
            cause_click_ts: null,
          },
        });
      }
    }
    const observer = new Observer((records) => {
      if (!active || !refreshCapacity()) return;
      generation++;
      // Even an overflowing mutation batch must check known dialogs for removal.
      checkDetached = dialogs || notices;
      const start = window.performance.now();
      let intake = 0;
      const withinBudget = () => {
        if (++intake <= MAX_MUTATIONS && window.performance.now() - start < FRAME_MS) return true;
        overflow('mutation intake');
        return false;
      };
      records: for (const record of records) {
        if (!withinBudget()) break;
        if (record.type === 'attributes') {
          if (dialogs) collect(record.target, true, false);
        } else {
          collect(record.target, false);
          for (let i = 0; i < record.addedNodes.length; i++) {
            if (!withinBudget()) break records;
            collect(record.addedNodes[i], true);
          }
        }
      }
      if (checkDetached || roots.size || pendingNotices.size || pendingDialogs.size) schedule();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: notices,
      attributes: dialogs,
      ...(dialogs ? { attributeFilter: ['open', 'hidden', 'aria-hidden'] } : {}),
    });
    return cleanup;
  },
};
