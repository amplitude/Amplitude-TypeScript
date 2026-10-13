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
  const respond = (error, response) =>
    window.postMessage(
      { source: RESPONSE_SOURCE, id, error, result: error ? undefined : response },
      window.location.origin,
    );
  try {
    chrome.runtime.sendMessage({ action, payload }, (response) => {
      respond(chrome.runtime.lastError?.message ?? response?.error, response);
    });
  } catch {
    // Reloading the extension orphans the content scripts already sitting on open pages: this one keeps
    // running, but its chrome.runtime is gone and sendMessage throws rather than reaching anything. Saying
    // so beats letting the page wait out its timeout and conclude the extension is broken, which is the
    // opposite of what happened — it's this copy of the page that's stale.
    respond('This page predates the last extension reload and can no longer reach it. Reload this page.');
  }
});
