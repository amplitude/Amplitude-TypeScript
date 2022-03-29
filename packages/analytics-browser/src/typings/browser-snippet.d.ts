export interface SnippetProxy {
  _q: Array<[string, ...Array<any>]>;
}
export interface AmplitudeProxy extends SnippetProxy {
  invoked?: boolean;
}

declare global {
  interface Window {
    amplitude: AmplitudeProxy;
  }
}
