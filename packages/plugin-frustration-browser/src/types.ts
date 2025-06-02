export type Click = {
  x: number;
  y: number;
  Time: string;
};

export type ClickEvent = {
  begin: number;
  end?: number;
  count: number;
  timer: ReturnType<typeof setTimeout>;
  clicks: Click[];
};

export type RageClickOptions = {
  timeout: number;
  threshold: number;
  ignoreSelector: string;
  onRageClick: (event: ClickEvent, element: HTMLElement) => void;
};

export type RageClickEventPayload = {
  '[Amplitude] Begin Time': number;
  '[Amplitude] End Time': number;
  '[Amplitude] Duration': number;
  '[Amplitude] Element Text': string;
  '[Amplitude] Element Tag': string;
  '[Amplitude] Clicks': Click[];
};
