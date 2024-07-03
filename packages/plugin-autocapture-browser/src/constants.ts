export const PLUGIN_NAME = '@amplitude/plugin-autocapture-browser';

export const AMPLITUDE_ELEMENT_CLICKED_EVENT = '[Amplitude] Element Clicked';
export const AMPLITUDE_ELEMENT_CHANGED_EVENT = '[Amplitude] Element Changed';

export const AMPLITUDE_EVENT_PROP_ELEMENT_ID = '[Amplitude] Element ID';
export const AMPLITUDE_EVENT_PROP_ELEMENT_CLASS = '[Amplitude] Element Class';
export const AMPLITUDE_EVENT_PROP_ELEMENT_TAG = '[Amplitude] Element Tag';
export const AMPLITUDE_EVENT_PROP_ELEMENT_TEXT = '[Amplitude] Element Text';
export const AMPLITUDE_EVENT_PROP_ELEMENT_HIERARCHY = '[Amplitude] Element Hierarchy';
export const AMPLITUDE_EVENT_PROP_ELEMENT_HREF = '[Amplitude] Element Href';
export const AMPLITUDE_EVENT_PROP_ELEMENT_POSITION_LEFT = '[Amplitude] Element Position Left';
export const AMPLITUDE_EVENT_PROP_ELEMENT_POSITION_TOP = '[Amplitude] Element Position Top';
export const AMPLITUDE_EVENT_PROP_ELEMENT_ARIA_LABEL = '[Amplitude] Element Aria Label';
export const AMPLITUDE_EVENT_PROP_ELEMENT_ATTRIBUTES = '[Amplitude] Element Attributes';
// Deprecated in favor of AMPLITUDE_EVENT_PROP_ELEMENT_HIERARCHY. Keeping for backwards compatibility.
export const AMPLITUDE_EVENT_PROP_ELEMENT_SELECTOR = '[Amplitude] Element Selector';

export const AMPLITUDE_EVENT_PROP_ELEMENT_PARENT_LABEL = '[Amplitude] Element Parent Label';
export const AMPLITUDE_EVENT_PROP_PAGE_URL = '[Amplitude] Page URL';
export const AMPLITUDE_EVENT_PROP_PAGE_TITLE = '[Amplitude] Page Title';
export const AMPLITUDE_EVENT_PROP_VIEWPORT_HEIGHT = '[Amplitude] Viewport Height';
export const AMPLITUDE_EVENT_PROP_VIEWPORT_WIDTH = '[Amplitude] Viewport Width';
export const AMPLITUDE_EVENT_PROP_AUTOCAPTURE_VERSION = '[Amplitude] Autocapture Version';

// Visual Tagging related constants
export const AMPLITUDE_ORIGIN = 'https://app.amplitude.com';
export const AMPLITUDE_ORIGIN_EU = 'https://app.eu.amplitude.com';
export const AMPLITUDE_ORIGIN_STAGING = 'https://apps.stag2.amplitude.com';
export const AMPLITUDE_ORIGINS_MAP = {
  US: AMPLITUDE_ORIGIN,
  EU: AMPLITUDE_ORIGIN_EU,
  STAGING: AMPLITUDE_ORIGIN_STAGING,
};

export const AMPLITUDE_VISUAL_TAGGING_SELECTOR_SCRIPT_URL =
  'https://cdn.amplitude.com/libs/visual-tagging-selector-0.2.2.js.gz';
// This is the class name used by the visual tagging selector to highlight the selected element.
// Should not use this class in the selector.
export const AMPLITUDE_VISUAL_TAGGING_HIGHLIGHT_CLASS = 'amp-visual-tagging-selector-highlight';
