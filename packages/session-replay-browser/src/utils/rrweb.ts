import { getGlobalScope } from '@amplitude/analytics-core';
import dom from '@amplitude/rrweb-utils';

export function getWindowScroll(win: Window) {
  const doc = win.document;
  return {
    left: doc.scrollingElement
      ? doc.scrollingElement.scrollLeft
      : win.pageXOffset !== undefined
      ? win.pageXOffset
      : doc.documentElement.scrollLeft ||
        (doc?.body && dom.parentElement(doc.body)?.scrollLeft) ||
        doc?.body?.scrollLeft ||
        0,
    top: doc.scrollingElement
      ? doc.scrollingElement.scrollTop
      : win.pageYOffset !== undefined
      ? win.pageYOffset
      : doc?.documentElement.scrollTop ||
        (doc?.body && dom.parentElement(doc.body)?.scrollTop) ||
        doc?.body?.scrollTop ||
        0,
  };
}

export function getWindowHeight(): number {
  const globalScope = getGlobalScope();
  return (
    globalScope?.innerHeight ||
    (document.documentElement && document.documentElement.clientHeight) ||
    (document.body && document.body.clientHeight) ||
    0
  );
}

export function getWindowWidth(): number {
  const globalScope = getGlobalScope();
  return (
    globalScope?.innerWidth ||
    (document.documentElement && document.documentElement.clientWidth) ||
    (document.body && document.body.clientWidth) ||
    0
  );
}
