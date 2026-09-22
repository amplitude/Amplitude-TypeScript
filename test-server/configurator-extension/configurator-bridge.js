// Sits on the configurator page and relays its requests to the service worker.
//
// This runs in an isolated world, so window.postMessage is the only channel it shares with the page —
// which is the point: the page gets to reach the extension without knowing its ID, and the marker below
// lets the page tell that the extension is there at all.
const REQUEST_SOURCE = 'amplitude-configurator';
const RESPONSE_SOURCE = 'amplitude-configurator-extension';

document.documentElement.dataset.amplitudeConfigurator = chrome.runtime.getManifest().version;

window.addEventListener('message', (event) => {
  // Only messages this page sent to itself: anything cross-window is somebody else's business.
  if (event.source !== window || event.data?.source !== REQUEST_SOURCE) {
    return;
  }
  const { id, action, payload } = event.data;
  chrome.runtime.sendMessage({ action, payload }, (response) => {
    const error = chrome.runtime.lastError?.message ?? response?.error;
    window.postMessage(
      { source: RESPONSE_SOURCE, id, error, result: error ? undefined : response },
      window.location.origin,
    );
  });
});
