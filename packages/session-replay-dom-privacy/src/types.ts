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
};
