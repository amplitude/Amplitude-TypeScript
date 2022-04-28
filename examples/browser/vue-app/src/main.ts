import { createApp } from 'vue';
import App from './App.vue';
import * as amplitude from '@amplitude/analytics-browser';

/**
 * Start by calling amplitude.init(). This must be done before any event tracking
 * preferrably in the root file of the project.
 *
 * Calling init() requires an API key
 * ```
 * amplitude.init(API_KEY)
 * ```
 *
 * Optionally, a user id can be provided when calling init()
 * ```
 * amplitude.init(API_KEY, 'example.vue.user@amplitude.com')
 * ```
 *
 * Optionally, a config object can be provided. Refer to https://amplitude.github.io/Amplitude-TypeScript/interfaces/Types.BrowserConfig.html
 * for object properties.
 */
amplitude.init('API_KEY', 'example.vue.user@amplitude.com');

createApp(App).mount('#app');
