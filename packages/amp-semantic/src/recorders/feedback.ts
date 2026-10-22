import type { SemanticDomChange, SemanticDomNode, SemanticPayloads, SemanticRecorder } from '../types';
const LIVE = '[role="alert"],[role="status"],[role="log"],[aria-live="polite"],[aria-live="assertive"]';
const DIALOG = 'dialog,[role="dialog"],[role="alertdialog"],[aria-modal="true"]';
const MAX_BATCHES = 128;
const MAX_PENDING = 256;
const MAX_VISITS = 1000;
const FRAME_MS = 4;
const DELIVERY_MS = 2;
const MAX_PAYLOADS = 50;
type DialogState = { open: boolean; payload: SemanticPayloads['dialog'] };

type Work =
  | { node: SemanticDomNode; baseline: boolean; hidden: boolean }
  | { id: number; text?: boolean; dialogs?: boolean };

/** Walk serialized children without building a second tree or a width-sized queue. */
function* nodes(node: SemanticDomNode, baseline: boolean): Generator<Work> {
  const stack = [{ children: [node], index: 0, hidden: false }];
  while (stack.length) {
    const frame = stack[stack.length - 1];
    if (frame.index === frame.children.length) {
      stack.pop();
      continue;
    }
    const current = frame.children[frame.index++];
    const attrs = current.attributes;
    const hidden = frame.hidden || attrs?.hidden !== undefined || attrs?.['aria-hidden'] === 'true';
    yield { node: current, baseline, hidden };
    if (current.childNodes?.length) stack.push({ children: current.childNodes, index: 0, hidden });
  }
}
function* changes(change: SemanticDomChange): Generator<Work> {
  if (change.type === 'snapshot') {
    yield* nodes(change.node, true);
  } else {
    // Deliver direct changes before potentially large additions.
    for (const text of change.texts) yield { id: text.id, text: true };
    for (const attr of change.attributes) {
      yield {
        id: attr.id,
        dialogs: ['open', 'hidden', 'aria-hidden', 'role', 'aria-modal'].some((key) => key in attr.attributes),
      };
    }
    const parents = new Set<number>();
    const parentChanged = (id: number): Work => {
      const text = !parents.has(id);
      if (parents.size < MAX_VISITS) parents.add(id);
      return { id, text };
    };
    for (const remove of change.removes) yield parentChanged(remove.parentId);
    for (const add of change.adds) {
      yield parentChanged(add.parentId);
      yield* nodes(add.node, false);
    }
  }
}

/** Enrich accepted replay changes; never observe or rediscover the DOM independently. */
export const feedbackRecorder: SemanticRecorder = {
  families: ['notice', 'dialog'],
  setup(context) {
    let notices = context.hasCapacity('notice');
    let dialogs = context.hasCapacity('dialog');
    const { host, helpers } = context;
    const { window } = host;
    if ((!notices && !dialogs) || !host.getNode) return () => undefined;
    let active = true;
    let lastClick: number | null = null;
    let frame: number | undefined;
    let fallbackFrame = false;
    // Bound retained elements as well as per-frame work. Overflow is lossy and
    // reported once per queue through the existing host diagnostics channel.
    let generation = 0;
    const batches: { work: Generator<Work>; generation: number }[] = [];
    const trackedDialogs = new Set<Element>();
    const pendingNotices = new Set<Element>();
    const pendingDialogs = new Set<Element>();
    const lastNotices = new WeakMap<Element, number>();
    const seenNotices = new WeakMap<Element, number>();
    const noticeTimers = new Map<Element, number>();
    const dialogStates = new WeakMap<Element, DialogState>();
    const openDialogs = new Set<Element>();
    const overflows = new Set<string>();
    let checkStructure = false;
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
        if (!element.isConnected && openDialogs.has(element)) checkStructure = true;
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
        element.matches(DIALOG) &&
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
      element.matches(DIALOG) &&
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
      unsubscribeDom();
      unsubscribe();
      cancelFrame();
      clearNotices();
      batches.length = 0;
      trackedDialogs.clear();
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
        trackedDialogs.clear();
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
        trackedDialogs.delete(element);
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
      if (!element.isConnected) trackedDialogs.delete(element);
    };
    const flush = () => {
      frame = undefined;
      if (!active || !refreshCapacity()) return;
      const start = window.performance.now();
      if (checkStructure) {
        checkStructure = false;
        // This set is bounded. Never traverse a detached subtree for discovery.
        for (const element of trackedDialogs) {
          // A move can change a connected dialog's hidden ancestry too.
          enqueueDialog(element);
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
        for (const element of trackedDialogs) {
          if (!element.isConnected && !openDialogs.has(element)) trackedDialogs.delete(element);
        }
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
      while (active && batches.length && visited++ < MAX_VISITS && window.performance.now() - start < FRAME_MS) {
        const batch = batches[0];
        const item = batch.work.next();
        if (item.done) batches.shift();
        else consume(item.value, batch.generation);
      }
      deliver(start + FRAME_MS);
      if (active && (checkStructure || batches.length || pendingNotices.size || pendingDialogs.size)) schedule();
    };
    const schedule = () => {
      if (!active || frame !== undefined) return;
      fallbackFrame = typeof window.requestAnimationFrame !== 'function';
      frame = fallbackFrame ? window.setTimeout(flush, 16) : window.requestAnimationFrame(flush);
    };
    const track = (element: Element) => {
      if (trackedDialogs.has(element)) return true;
      if (trackedDialogs.size >= MAX_PENDING) {
        overflow('dialog tracking');
        return false;
      }
      trackedDialogs.add(element);
      return true;
    };
    const consume = (work: Work, batchGeneration: number) => {
      if ('node' in work) {
        const { node, baseline, hidden } = work;
        if (node.type !== 2) return;
        const attrs = node.attributes ?? {};
        const dialog =
          node.tagName === 'dialog' ||
          attrs.role === 'dialog' ||
          attrs.role === 'alertdialog' ||
          attrs['aria-modal'] === 'true';
        const live =
          ['alert', 'status', 'log'].includes(attrs.role as string) ||
          ['polite', 'assertive'].includes(attrs['aria-live'] as string);
        if (!(dialogs && dialog) && !(notices && live && !baseline)) return;
        const element = host.getNode?.(node.id);
        if (!element || element.nodeType !== 1 || helpers.blocked(element as Element)) return;
        const target = element as Element;
        if (dialogs && dialog && track(target)) {
          if (baseline && !dialogStates.has(target)) {
            // Seed from recorded state, not a later live DOM state. Initial snapshots do
            // not announce pre-existing notices or synthesize dialog-open events.
            const open = !hidden && (node.tagName !== 'dialog' || attrs.open !== undefined);
            dialogStates.set(target, {
              open,
              payload: {
                id: node.id,
                role: attrs.role === 'alertdialog' ? 'alertdialog' : 'dialog',
                name: null,
                name_source: 'unnamed',
                state: open ? 'open' : 'closed',
                modal: attrs['aria-modal'] === 'true' || attrs.rr_open_mode === 'modal',
                visible: false,
                cause_click_ts: null,
              },
            });
            if (open) openDialogs.add(target);
          } else {
            const previous = dialogStates.get(target);
            if (previous && baseline) previous.payload.id = node.id;
            enqueueDialog(target);
          }
        }
        if (notices && live && !baseline) enqueueNotice(target, batchGeneration);
        return;
      }
      if (!(notices && work.text) && !(dialogs && work.dialogs)) return;
      const node = host.getNode?.(work.id);
      const element = node?.nodeType === 1 ? (node as Element) : node?.parentElement;
      if (!element || !element.isConnected || helpers.blocked(element)) return;
      if (notices && work.text) {
        const region = element.closest(LIVE);
        if (region) enqueueNotice(region, batchGeneration);
      }
      if (dialogs && work.dialogs) {
        if (element.matches(DIALOG) && track(element)) enqueueDialog(element);
        // Ancestor visibility can affect already recorded dialogs. This registry is
        // bounded; no selector query or subtree walk is needed.
        for (const dialog of trackedDialogs) {
          if (element.contains(dialog)) enqueueDialog(dialog);
        }
      }
    };
    const unsubscribeDom = context.on('dom', (change) => {
      if (!active || !refreshCapacity()) return;
      generation++;
      if (change.type === 'snapshot' || change.removes.length) checkStructure = true;
      if (batches.length >= MAX_BATCHES) overflow('replay batch queue');
      else batches.push({ work: changes(change), generation });
      schedule();
    });
    return cleanup;
  },
};
