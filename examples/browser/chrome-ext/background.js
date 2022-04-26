/**
 * Amplitude using importScripts(). Create a copy of amplitude-min.js as part of your project and use the file path.
 */
importScripts('/amplitude-min.js');

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
 * amplitude.init(API_KEY, 'example.react.user@amplitude.com')
 * ```
 *
 * Optionally, a config object can be provided. Refer to https://amplitude.github.io/Amplitude-TypeScript/interfaces/Types.BrowserConfig.html
 * for object properties.
 */
amplitude.init('7e31488679ff2fe6bf65e880aab7c040', 'example.extension.user@amplitude.com');

chrome.omnibox.onInputEntered.addListener((text) => {
  amplitude.track('Input Entered', { value: text });
  var newURL = 'https://www.google.com/search?q=' + encodeURIComponent(text);
  chrome.tabs.update({ url: newURL });
});

chrome.omnibox.onDeleteSuggestion.addListener((text) => {
  amplitude.track('Delete Suggestion', { value: text });
});

chrome.omnibox.onInputCancelled.addListener((text) => {
  amplitude.track('Input Cancelled', { value: text });
});

chrome.omnibox.onInputChanged.addListener((text) => {
  amplitude.track('Input Changed', { value: text });
});

chrome.omnibox.onInputStarted.addListener((text) => {
  amplitude.track('Input Started', { value: text });
});
