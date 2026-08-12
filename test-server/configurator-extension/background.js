// Decides which tabs get instrumented, and injects the SDK into them.
//
// Injection happens on webNavigation.onCommitted rather than through a registered content script,
// because a registered script can't be handed anything: this has to carry a configuration, and
// executeScript(func, args) is the only injection that takes arguments. The cost is timing — onCommitted
// with injectImmediately lands before the page's own scripts, but a little later than a document_start
// registration would. If catching the very first request ever matters more than being configurable,
// register instead and bake the configuration into a file.
//
// Two things stay true either way, and both matter:
//   world: 'MAIN'  the SDK shares globals with the page, so it sees the page's own fetch, XHR and
//                  history. In an isolated world those patches would apply to nothing.
//   top frame only for now, so a page full of iframes doesn't get an instance per frame.
import { cspReport, relaxCsp, restoreCsp } from './csp.js';

const SDK_BUNDLE = 'vendor/amplitude-min.js';
const SESSION_REPLAY_BUNDLE = 'vendor/plugin-session-replay-browser-min.js';

const TABS_KEY = 'instrumentedTabs';
const LAST_PAYLOAD_KEY = 'lastPayload';

// Everything the SDKs key their storage by, from AMPLITUDE_PREFIX in analytics-core's
// types/constants.ts: `AMP_<apiKey>` holds the device ID, session ID and user ID, `AMP_MKTG_<apiKey>` the
// last campaign, and `AMP_unsent_`, `AMP_remote_config_`, `AMP_SR_START_`, `AMP_PAGE_VIEW` the rest. The
// lowercase form is getOldCookieName()'s, still read by the cookie migration on init.
const AMPLITUDE_STORAGE_PREFIXES = ['AMP_', 'amp_'];

// What the configurator sends when no API key has been typed in — PLACEHOLDER_API_KEY in its snippet.js.
const PLACEHOLDER_API_KEY = 'YOUR_API_KEY';

// What the toolbar button uses before the configurator has sent anything.
const FALLBACK_PAYLOAD = {
  apiKey: 'REPLACE_WITH_A_SCRATCH_PROJECT_KEY',
  analytics: {
    logLevel: 4,
    autocapture: {
      attribution: true,
      fileDownloads: true,
      formInteractions: true,
      pageViews: true,
      sessions: true,
      elementInteractions: true,
      frustrationInteractions: true,
      // The default only captures 500-599, which makes a healthy site look like nothing is working.
      networkTracking: { captureRules: [{ hosts: ['*'], statusCodeRange: '200-599' }] },
      webVitals: true,
    },
  },
  sessionReplay: null,
  engagement: null,
};

async function instrumentedTabs() {
  const { [TABS_KEY]: tabs = {} } = await chrome.storage.session.get(TABS_KEY);
  return tabs;
}

// A tab is not a thing that stays put: it can be closed, and Chrome can swap it for a prerendered one
// mid-navigation. Every call below that names a tab id can therefore find nothing there, and tabs, action
// and scripting all say so the same way — "No tab with id: 1234.", a message that says nothing about what
// was being attempted and so is worth catching rather than showing.
function isMissingTab(error) {
  return /No tab with id/.test(error?.message ?? '');
}

// For the calls that only decorate a tab: a tab that has gone away has no badge or tooltip worth setting,
// and failing to set one is not worth abandoning a run over.
async function ignoreMissingTab(pending) {
  try {
    await pending;
  } catch (error) {
    if (!isMissingTab(error)) {
      throw error;
    }
  }
}

// An async listener that rejects has nowhere to put the error: it becomes an uncaught rejection in the
// service worker's console and on the extension's card at chrome://extensions, with nothing to say what was
// being attempted. Named here so anything that does go wrong arrives with its context attached.
function guard(name, handler) {
  return (...args) =>
    handler(...args).catch((error) => {
      // The tab this was about is gone, which onRemoved has already tidied up after.
      if (isMissingTab(error)) {
        return;
      }
      console.error(`[amplitude-configurator] ${name} failed`, error);
    });
}

// Both transitions carry the CSP rule with them, so no path can mark a tab and forget to clear the way for
// what the SDK is about to do — or leave a tab unprotected after instrumentation stops.
async function instrument(tabId, payload) {
  const tabs = await instrumentedTabs();
  await chrome.storage.session.set({ [TABS_KEY]: { ...tabs, [tabId]: payload } });
  await relaxCsp(tabId);
  await ignoreMissingTab(chrome.action.setBadgeText({ tabId, text: 'on' }));
}

async function forget(tabId) {
  const tabs = await instrumentedTabs();
  delete tabs[tabId];
  await chrome.storage.session.set({ [TABS_KEY]: tabs });
  await restoreCsp(tabId);
}

// The payload this commit runs with — and, as a side effect, the payload every later commit in the tab will
// run with.
//
// Two of its options describe arriving at a site rather than being on one, so they belong to the page a run
// opens with and to no other. Clearing again would hand out a new device ID and session on every page, and
// there would be no session left to watch. A referrer mocked again would keep insisting the visitor came
// from somewhere else when they in fact came from the previous page of the site, which is a story no real
// second pageview tells. Both are therefore spent here: read for this commit, then taken off what is stored.
//
// Session storage rather than a variable because the service worker is routinely torn down between marking a
// tab and the navigation it opened, which would otherwise make "first commit" mean "first since the worker
// last woke up".
async function takePayload(tabId) {
  const tabs = await instrumentedTabs();
  const payload = tabs[tabId];
  if (!payload) {
    return undefined;
  }
  const { clearSession, mockReferrer, ...rest } = payload;
  if (clearSession || mockReferrer) {
    await chrome.storage.session.set({ [TABS_KEY]: { ...tabs, [tabId]: rest } });
  }
  return payload;
}

// Runs in the page before the SDK bundle: saves what the page had under window.amplitude, since the
// bundle is about to write over it, and leaves the configuration where inject.js will look for it.
function handOver(payload, csp) {
  // document.referrer is a configurable accessor inherited from Document.prototype, so an own property
  // shadows it for the page and for the SDK's campaign parser alike, and only for this document — the next
  // page the tab commits gets a payload with no referrer in it. Only the JS view moves: the request that
  // fetched this page carried whatever Referer the browser chose, and nothing here can change that after
  // the fact.
  if (payload.mockReferrer) {
    Object.defineProperty(document, 'referrer', {
      configurable: true,
      get: () => payload.mockReferrer,
    });
  }
  window.__amplitudeConfigurator = {
    hadGlobal: 'amplitude' in window,
    properties: window.amplitude ? { ...window.amplitude } : undefined,
    payload,
    csp,
  };
}

// Runs in the page before the SDK bundle, so what init() finds is an origin the SDK has never seen: no
// device ID, no session, no stored campaign. Only Amplitude's own keys go, since the site's login and the
// rest of its storage are what make it worth testing on.
function clearStoredSession(prefixes) {
  const isAmplitude = (key) => prefixes.some((prefix) => key.startsWith(prefix));
  const removed = [];

  // document.cookie yields names and values and never the domain a cookie was set on, while the SDK writes
  // to the highest domain it can — so each name is expired against every suffix of this hostname as well as
  // host-only. Suffixes that may not hold cookies, like a public one, are refused rather than mis-set, and
  // path=/ is what the SDK writes.
  const labels = location.hostname.split('.');
  const domains = ['', ...labels.map((_, index) => `.${labels.slice(index).join('.')}`)];
  for (const pair of document.cookie ? document.cookie.split('; ') : []) {
    const separator = pair.indexOf('=');
    const name = (separator === -1 ? pair : pair.slice(0, separator)).trim();
    if (!name || !isAmplitude(name)) {
      continue;
    }
    for (const domain of domains) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:01 GMT; path=/${domain && `; domain=${domain}`}`;
    }
    removed.push(`cookie ${name}`);
  }

  for (const [label, store] of [
    ['localStorage', localStorage],
    ['sessionStorage', sessionStorage],
  ]) {
    // Reading either throws outright where the site's cookie policy forbids it, which says nothing about
    // the other or about the cookies above.
    try {
      for (const key of Object.keys(store).filter(isAmplitude)) {
        store.removeItem(key);
        removed.push(`${label} ${key}`);
      }
    } catch (error) {
      console.warn(`[amplitude-configurator] ${label} could not be read, so nothing was cleared from it`, error);
    }
  }

  // Named individually: "the session was cleared" and "the session was already empty" lead to different
  // places when a run doesn't look the way it was expected to.
  if (removed.length) {
    console.log(`[amplitude-configurator] cleared ${removed.length} stored Amplitude entries`, removed);
  } else {
    console.log('[amplitude-configurator] no stored Amplitude state to clear on this origin');
  }
}

chrome.webNavigation.onCommitted.addListener(
  guard('injection', async ({ tabId, frameId, url }) => {
    if (frameId !== 0 || !url.startsWith('http')) {
      return;
    }
    const payload = await takePayload(tabId);
    if (!payload) {
      return;
    }
    // Read before injecting: by the time a navigation commits the response headers have arrived, which is
    // where the policy the page was sent is still visible.
    const csp = cspReport(tabId, payload);
    if (csp) {
      await ignoreMissingTab(chrome.action.setTitle({ tabId, title: csp.summary }));
    }
    const target = { tabId };
    const inject = (options) =>
      chrome.scripting.executeScript({ target, world: 'MAIN', injectImmediately: true, ...options });
    try {
      await inject({ func: handOver, args: [payload, csp] });
      if (payload.clearSession) {
        await inject({ func: clearStoredSession, args: [AMPLITUDE_STORAGE_PREFIXES] });
      }
      await inject({ files: [SDK_BUNDLE] });
      if (payload.sessionReplay) {
        // Its own call: a plugin bundle that won't load shouldn't stop analytics from running, and
        // inject.js reports the gap when the global it expects isn't there.
        try {
          await inject({ files: [SESSION_REPLAY_BUNDLE] });
        } catch (error) {
          console.warn('[amplitude-configurator] session replay bundle failed to load', error);
        }
      }
      await inject({ files: ['inject.js'] });
    } catch (error) {
      if (isMissingTab(error)) {
        throw error;
      }
      console.error('[amplitude-configurator] injection failed', error);
      await ignoreMissingTab(chrome.action.setBadgeText({ tabId, text: 'err' }));
    }
  }),
);

function describe(payload) {
  const parts = ['analytics'];
  if (payload.sessionReplay) {
    parts.push('session replay');
  }
  let message = `Opened ${payload.url} with ${parts.join(' and ')}.`;
  // Said before the navigation happens, so it can only promise the behaviour; what the policy actually
  // said reaches the page console, which is where the rest of the run is read anyway.
  message += " That tab's Content-Security-Policy is removed, and its console reports what it would have blocked.";
  if (payload.engagement) {
    // Its bundle is fetched from the CDN at runtime rather than packaged here. A strict CSP no longer
    // stands in the way, so this is now only a matter of the runner learning to load it.
    message += ' Guides and Surveys was left out: the runner does not load its CDN bundle yet.';
  }
  if (payload.mockReferrer) {
    message += ` document.referrer reads ${payload.mockReferrer} on that first page, and the truth after it.`;
  }
  if (payload.clearSession) {
    message +=
      " Amplitude's stored cookies and web storage are cleared first, so the run starts with a new device ID" +
      ' and session.';
  }
  if (payload.apiKey === PLACEHOLDER_API_KEY) {
    message += ' No API key is set, so events are built but rejected.';
  }
  return message;
}

async function runOnUrl(payload) {
  const url = new URL(payload.url);
  if (!/^https?:$/.test(url.protocol)) {
    throw new Error('Only http and https URLs can be instrumented.');
  }
  // The tab opens blank so it can be marked for instrumentation before it commits anything; navigating
  // afterwards is what makes the ordering reliable. It also means there is a moment where the run depends
  // on a tab nobody is looking at yet, and anything that closes it — a click, a tab-tidying extension,
  // Chrome swapping in a prerender — leaves the steps below with nothing to work on.
  let tab;
  try {
    tab = await chrome.tabs.create({ url: 'about:blank', active: true });
    await instrument(tab.id, payload);
    await chrome.storage.session.set({ [LAST_PAYLOAD_KEY]: payload });
    await chrome.tabs.update(tab.id, { url: url.toString() });
  } catch (error) {
    if (!isMissingTab(error)) {
      throw error;
    }
    if (tab) {
      // The mark and the CSP rule are both keyed by tab id, and Chrome reuses ids, so leaving them behind
      // would take the policy off whichever tab inherits this one's.
      await forget(tab.id);
    }
    // The id is named because it is the one thing that ties this back to what the browser did with the tab.
    throw new Error(`Tab ${tab?.id} was opened for this run and went away before it could be navigated.`);
  }
  return { message: describe(payload) };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.action !== 'run-on-url') {
    return false;
  }
  runOnUrl(message.payload).then(sendResponse, (error) => sendResponse({ error: error.message }));
  return true;
});

// The toolbar button instruments the tab you're looking at, with whatever the configurator sent last.
chrome.action.onClicked.addListener(
  guard('toolbar button', async (tab) => {
    if (!tab.url?.startsWith('http')) {
      return;
    }
    if ((await instrumentedTabs())[tab.id]) {
      await forget(tab.id);
      await ignoreMissingTab(chrome.action.setBadgeText({ tabId: tab.id, text: '' }));
    } else {
      const { [LAST_PAYLOAD_KEY]: lastPayload } = await chrome.storage.session.get(LAST_PAYLOAD_KEY);
      await instrument(tab.id, lastPayload ?? FALLBACK_PAYLOAD);
    }
    // The injection only happens on the next commit, which is also the only way to catch a page early.
    await chrome.tabs.reload(tab.id);
  }),
);

chrome.tabs.onRemoved.addListener(guard('cleanup', (tabId) => forget(tabId)));

// Chrome can finish a navigation in a different tab than it started in: a prerendered page arrives in a tab
// of its own and takes the old one's place, which destroys the id everything here is keyed by. Moving the
// mark and the CSP rule across keeps the run alive, and keeps a rule from outliving the tab it was for.
chrome.tabs.onReplaced.addListener(
  guard('tab replacement', async (addedTabId, removedTabId) => {
    const payload = (await instrumentedTabs())[removedTabId];
    if (!payload) {
      return;
    }
    await forget(removedTabId);
    await instrument(addedTabId, payload);
  }),
);
