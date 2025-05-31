import { ClickEvent, RageClickOptions } from './types';

const CLICKABLE_ELEMENT_SELECTOR = 'a,button,input';

const rageClickedElements = new Map<HTMLElement, ClickEvent>();
let timeout: number;
let threshold: number;
let ignoreSelector: string;
let onRageClick: (event: ClickEvent, element: HTMLElement) => void;

export function init(options: RageClickOptions): void {
  timeout = options.timeout;
  threshold = options.threshold;
  ignoreSelector = options.ignoreSelector;
  onRageClick = options.onRageClick;
}

export function registerClick(clickedEl: HTMLElement, event: MouseEvent): void {
  const target: HTMLElement | null = clickedEl.closest(CLICKABLE_ELEMENT_SELECTOR);
  if (!target) {
    return;
  }
  if (ignoreSelector && target.matches(ignoreSelector)) {
    return;
  }

  let clickEvent = rageClickedElements.get(target);

  // create a new click event if it doesn't exist
  const eventTime = Math.floor(performance.now() + performance.timeOrigin);
  if (!clickEvent) {
    const timer = setTimeout(() => {
      rageClickedElements.delete(target);
    }, timeout);
    clickEvent = {
      begin: eventTime,
      count: 0,
      timer,
      clicks: [],
    };
    rageClickedElements.set(target, clickEvent);
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
      rageClickedElements.delete(target);
      clearTimeout(clickEvent.timer);
    }
  }
}

export function clear(): void {
  rageClickedElements.clear();
}
