/**
 * Shared constants for the element-selector package.
 *
 * These live here (rather than in any single consuming plugin) because the
 * event-property name must be identical everywhere the selector-config hash is
 * reported. The autocapture plugin (Element Clicked, Viewport Content Updated),
 * the frustration plugin (Rage Click), and the page-view-tracking plugin (Page
 * Viewed) are three independent plugins in separate packages; none can import
 * from another, but all can depend on `@amplitude/element-selector`. Centralizing
 * the constant here guarantees they all emit the same property key.
 */

/**
 * Event-property name under which the stable selector-algorithm config hash
 * (see {@link hashSelectorConfig}) is recorded on autocapture "zoning" events.
 */
export const AMPLITUDE_EVENT_PROP_SELECTOR_ALGO_CONFIG_HASH = '[Amplitude] Selector Algo Config Hash';

/**
 * Remote-config key for the element-selector engine payload. Shared across SDK
 * plugins that need to stay in sync with the active selector configuration.
 */
export const ELEMENT_SELECTOR_REMOTE_CONFIG_KEY = 'configs.analyticsSDK.elementSelector';
