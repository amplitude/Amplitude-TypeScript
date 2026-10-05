const CLICK_TIMEOUT_MS = 3000;
const UI_CHANGE_MAX_DELAY_MS = 500;

export interface DeadClickData {
  time: number;
  eventProperties: Record<string, any>;
  coordinates: {
    x: number;
    y: number;
  };
}

export interface DeadClickTracker {
  registerClickEvent(coordinates: { x: number; y: number }, eventProperties: Record<string, any>): () => void;
  registerInterfaceChange(time: number): void;
  setProvidingInterfaceSignals(isProviding: boolean): void;
  reset(): void;
}

export function createDeadClickTracker(deadClickHandler: (clickData: DeadClickData) => void): DeadClickTracker {
  let pendingClicks: DeadClickData[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let isProvidingInterfaceSignals = false;

  const clearTimer = () => {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  const reset = () => {
    clearTimer();
    pendingClicks = [];
  };

  const triggerDeadClick = () => {
    const clickData = pendingClicks[0];
    if (!clickData) {
      clearTimer();
      return;
    }

    deadClickHandler(clickData);
    pendingClicks = pendingClicks.filter((pendingClick) => pendingClick.eventProperties !== clickData.eventProperties);
    refreshTimer();
  };

  const refreshTimer = () => {
    clearTimer();

    const firstClick = pendingClicks[0];
    if (!firstClick) {
      return;
    }

    const timeout = CLICK_TIMEOUT_MS + UI_CHANGE_MAX_DELAY_MS - (Date.now() - firstClick.time);
    if (timeout > 0) {
      timer = setTimeout(triggerDeadClick, timeout);
    } else {
      triggerDeadClick();
    }
  };

  const registerClickEvent = (coordinates: { x: number; y: number }, eventProperties: Record<string, any>) => {
    if (!isProvidingInterfaceSignals) {
      return () => undefined;
    }

    const clickData = {
      time: Date.now(),
      eventProperties,
      coordinates,
    };
    pendingClicks.push(clickData);
    if (!timer) {
      refreshTimer();
    }

    return () => {
      pendingClicks = pendingClicks.filter((pendingClick) => pendingClick !== clickData);
      refreshTimer();
    };
  };

  const registerInterfaceChange = (time: number) => {
    clearTimer();
    pendingClicks = pendingClicks.filter((clickData) => clickData.time >= time);
    refreshTimer();
  };

  const setProvidingInterfaceSignals = (isProviding: boolean) => {
    isProvidingInterfaceSignals = isProviding;
    if (!isProvidingInterfaceSignals) {
      reset();
    }
  };

  return {
    registerClickEvent,
    registerInterfaceChange,
    setProvidingInterfaceSignals,
    reset,
  };
}

export function getDeadClickEventProperties(clickData: DeadClickData): Record<string, any> {
  return {
    ...clickData.eventProperties,
    ['[Amplitude] X Coordinate']: clickData.coordinates.x,
    ['[Amplitude] Y Coordinate']: clickData.coordinates.y,
  };
}
