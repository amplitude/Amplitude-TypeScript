// Takes the site's Content-Security-Policy off the tab being instrumented, and reports what it said.
//
// Script *files* injected with chrome.scripting are exempt from the page's CSP, which is why the SDK
// bundles load at all. Nothing the SDK does afterwards is exempt: the event uploads, the remote
// configuration fetch, the CDN bundles and session replay's blob: worker are ordinary page requests, so a
// strict connect-src or script-src stops them. Removing the header is the only offer the browser makes
// here — CSP enforces every policy it is handed, so a second policy can only narrow the first, and a
// declarative rule can't read the existing value in order to rewrite it.
//
// Removing it silently would throw away the most useful thing a run can tell you, so the original is
// recorded and handed to the page: a customer whose CSP blocks Amplitude wants to hear which directive did
// it. Only header-delivered policies can be touched — one in a <meta http-equiv> never crosses the network
// and is already in force by the time any of this could see it.

const CSP_HEADERS = ['content-security-policy', 'content-security-policy-report-only'];

// Hosts by server zone, from the SDK's own constants: analytics-core's types/constants.ts and
// remote-config.ts, and session-replay-browser's constants.ts.
const ZONES = {
  US: {
    events: 'https://api2.amplitude.com',
    remoteConfig: 'https://sr-client-cfg.amplitude.com',
    replay: 'https://api-sr.amplitude.com',
  },
  EU: {
    events: 'https://api.eu.amplitude.com',
    remoteConfig: 'https://sr-client-cfg.eu.amplitude.com',
    replay: 'https://api-sr.eu.amplitude.com',
  },
};

// Mirrors shouldFetchRemoteConfig() in analytics-browser/src/config.ts, which is the source of truth: on
// unless something turns it off, and the nested setting wins.
function fetchesRemoteConfig(analytics) {
  if (analytics.remoteConfig?.fetchRemoteConfig === true) {
    return true;
  }
  return analytics.remoteConfig?.fetchRemoteConfig !== false && analytics.fetchRemoteConfig !== false;
}

// Only what this configuration will actually reach for: a policy that would stop session replay is worth
// nobody's attention if session replay is off.
function requirementsFor({ analytics = {}, sessionReplay, engagement }) {
  const zone = ZONES[analytics.serverZone] ?? ZONES.US;
  let events = zone.events;
  if (analytics.serverUrl) {
    try {
      events = new URL(analytics.serverUrl).origin;
    } catch {
      // Free-form configurator input; an invalid URL must not abort injection.
    }
  }
  const requirements = [{ directive: 'connect-src', target: events, reason: 'event uploads' }];
  if (fetchesRemoteConfig(analytics)) {
    requirements.push({ directive: 'connect-src', target: zone.remoteConfig, reason: 'remote configuration' });
  }
  if (sessionReplay) {
    requirements.push(
      { directive: 'connect-src', target: zone.replay, reason: 'session replay uploads' },
      { directive: 'worker-src', target: 'blob:', reason: "session replay's compression worker" },
    );
  }
  if (engagement) {
    // The only piece still fetched from the CDN at runtime rather than injected from this extension.
    requirements.push({
      directive: 'script-src',
      target: 'https://cdn.amplitude.com',
      reason: 'the Guides and Surveys bundle',
    });
  }
  return requirements;
}

// Where each directive looks when it isn't named in the policy, per the CSP fallback chain.
const FALLBACKS = {
  'connect-src': ['default-src'],
  'script-src': ['default-src'],
  'worker-src': ['child-src', 'script-src', 'default-src'],
};

// Tabs whose rule is in place. Rehydrated from the rules themselves, since they are the state that
// survives the service worker being torn down between a run and the navigation it opened.
// Await before registering onHeadersReceived so a waking navigation cannot race an empty set.
const relaxed = new Set();
try {
  const rules = await chrome.declarativeNetRequest.getSessionRules();
  rules.forEach(({ id }) => relaxed.add(id));
} catch {
  // Leave relaxed empty; rules can still be added via relaxCsp.
}

// Only the policy of a tab under instrumentation is worth keeping, and only until the tab goes away.
const policies = new Map();

// An observer, not a modifier: what it sees is the response as it arrived, before the rule below takes the
// header off. That ordering is what makes reporting the original policy possible at all.
chrome.webRequest.onHeadersReceived.addListener(
  ({ tabId, responseHeaders }) => {
    if (!relaxed.has(tabId)) {
      return;
    }
    const header = responseHeaders?.find(({ name }) => name.toLowerCase() === CSP_HEADERS[0]);
    policies.set(tabId, header?.value);
  },
  { urls: ['<all_urls>'], types: ['main_frame'] },
  ['responseHeaders'],
);

// Tab id doubles as the rule id. Session scope is not a preference: the tabIds condition is only supported
// there, and a rule outliving the browser would leave a stranger's tab unprotected.
export async function relaxCsp(tabId) {
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [tabId],
    addRules: [
      {
        id: tabId,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          responseHeaders: CSP_HEADERS.map((header) => ({ header, operation: 'remove' })),
        },
        condition: { tabIds: [tabId], resourceTypes: ['main_frame', 'sub_frame'] },
      },
    ],
  });
  relaxed.add(tabId);
}

export async function restoreCsp(tabId) {
  relaxed.delete(tabId);
  policies.delete(tabId);
  await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [tabId] });
}

// First occurrence wins, which is how CSP reads a repeated directive.
function parsePolicy(policy) {
  const directives = new Map();
  for (const part of policy.split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name && !directives.has(name.toLowerCase())) {
      directives.set(
        name.toLowerCase(),
        sources.map((source) => source.toLowerCase()),
      );
    }
  }
  return directives;
}

function sourcesFor(directives, directive) {
  for (const name of [directive, ...(FALLBACKS[directive] ?? [])]) {
    if (directives.has(name)) {
      return directives.get(name);
    }
  }
  return undefined;
}

// Close enough to be useful, and not a CSP implementation: enough of the grammar to tell an origin that is
// plainly allowed from one that is plainly not.
function permits(sources, target) {
  if (sources.includes("'none'")) {
    return false;
  }
  // A scheme has to be named outright — * covers network schemes only, not blob: or data:.
  if (target.endsWith(':')) {
    return sources.includes(target);
  }
  const { protocol, host } = new URL(target);
  return sources.some((source) => {
    if (source === '*' || source === protocol) {
      return true;
    }
    // A host-source may carry a scheme, a port and a path, none of which change which host it names. Ports
    // and paths are ignored rather than compared, and so is the scheme: an http source matches https under
    // the spec's upgrade rules, and a policy naming http for an Amplitude endpoint isn't worth modelling.
    const named = source.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/[:/].*$/, '');
    return named === host || (named.startsWith('*.') && host.endsWith(named.slice(1)));
  });
}

// What the page was sent, and which of the SDK's requests it would have refused. Absent directives mean
// silence rather than permission only where the fallback chain runs out, so a policy naming neither the
// directive nor default-src allows the request.
export function cspReport(tabId, payload) {
  const policy = policies.get(tabId);
  if (!policy) {
    return null;
  }
  const directives = parsePolicy(policy);
  const blocked = requirementsFor(payload).filter(({ directive, target }) => {
    const sources = sourcesFor(directives, directive);
    return sources !== undefined && !permits(sources, target);
  });
  return { policy, blocked, summary: summarise(blocked) };
}

function summarise(blocked) {
  if (blocked.length === 0) {
    return 'The site sent a Content-Security-Policy that allows what the SDK needs.';
  }
  const listed = blocked.map(({ reason, directive }) => `${reason} (${directive})`).join(', ');
  return `The site's Content-Security-Policy would have blocked ${listed}.`;
}
