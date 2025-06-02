import { ClickEvent, RageClickOptions } from './types';

const CLICKABLE_ELEMENT_SELECTOR = 'a,button,input';

const clickedElements = new Map<HTMLElement, ClickEvent>();
let timeout: number;
let threshold: number;
let ignoreSelector: string;
let onRageClick: (event: ClickEvent, element: HTMLElement) => void;

export function init(options: RageClickOptions): void {
  timeout = options.timeout;
  threshold = options.threshold;
  // ignore clicks on elements matching this selector, and on elements
  // that are descendants of elements matching this selector
  ignoreSelector = options.ignoreSelector;
  onRageClick = options.onRageClick;
}

export function registerClick(clickedEl: HTMLElement, event: MouseEvent): void {
  const target: HTMLElement | null = clickedEl.closest(CLICKABLE_ELEMENT_SELECTOR);
  if (!target) {
    return;
  }
  if (ignoreSelector && (target.matches(ignoreSelector) || target.closest(ignoreSelector))) {
    return;
  }

  let clickEvent = clickedElements.get(target);

  // create a new click event if it doesn't exist
  const eventTime = Math.floor(performance.now() + performance.timeOrigin);
  if (!clickEvent) {
    const timer = setTimeout(() => {
      clickedElements.delete(target);
    }, timeout);
    clickEvent = {
      begin: eventTime,
      count: 0,
      timer,
      clicks: [],
    };
    clickedElements.set(target, clickEvent);
  }

  const elapsedTime = eventTime - clickEvent.begin;
  if (elapsedTime < timeout) {
    clickEvent.count += 1;
    clickEvent.clicks.push({
      x: event.clientX,
      y: event.clientY,
      Time: new Date(performance.now() + performance.timeOrigin).toISOString(),
    });
    if (clickEvent.count >= threshold) {
      clickEvent.end = Math.floor(performance.now() + performance.timeOrigin);
      onRageClick(clickEvent, target);
      clickedElements.delete(target);
      clearTimeout(clickEvent.timer);
    }
  }
}

export function clear(): void {
  clickedElements.clear();
}
