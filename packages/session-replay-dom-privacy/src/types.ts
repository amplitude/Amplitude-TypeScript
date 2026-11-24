export type MaskLevel =
  | 'light' // only mask a subset of inputs that's deemed sensitive - password, credit card, telephone #, email. These are information we never want to capture.
  | 'medium' // mask all form fields (inputs); page text is captured as-is
  | 'conservative'; // mask all inputs and all texts

export const DEFAULT_MASK_LEVEL = 'medium';

// err on the side of excluding more
export type PrivacyConfig = {
  blockSelector?: string | string[]; // exclude in the UI
  defaultMaskLevel?: MaskLevel;
  maskSelector?: string[];
  unmaskSelector?: string[];
  maskAttributes?: string[]; // HTML attribute names to mask (e.g. ["placeholder", "aria-label"])
  /**
   * Per-URL overrides for `defaultMaskLevel`. Each entry contains a glob pattern (`match`)
   * and a `maskLevel` to apply when the current page URL matches that pattern.
   * Rules are evaluated in order; the first match wins. Remote rules take precedence
   * over local rules (remote entries are prepended before local entries).
   *
   * @example
   * urlMaskLevels: [
   *   { match: 'https://example.com/checkout/*', maskLevel: 'conservative' },
   *   { match: 'https://example.com/public/*',   maskLevel: 'light' },
   * ]
   */
  urlMaskLevels?: Array<{ match: string; maskLevel: MaskLevel }>;
  /**
   * Local-only callback that replaces the default `*` redaction for text the SDK would
   * otherwise mask (for example text masked by `defaultMaskLevel: 'conservative'`).
   * Return the text to record. It is never called for blocked elements, for elements
   * explicitly masked via `amp-mask` / `maskSelector`, or for text that is not masked.
   * If it throws or returns a non-string, the text is fully redacted.
   * It cannot be set via remote config and runs synchronously on the main thread.
   */
  maskTextFn?: (text: string, element: HTMLElement | null) => string;
  /**
   * Same as `maskTextFn`, for input values. Never called for password inputs.
   */
  maskInputFn?: (text: string, element: HTMLElement | null) => string;
};
