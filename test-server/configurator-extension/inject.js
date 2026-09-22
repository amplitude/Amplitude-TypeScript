// Runs in the page's own world, after the SDK bundle, with the configuration left for it by
// background.js.
(() => {
  const handover = window.__amplitudeConfigurator;
  delete window.__amplitudeConfigurator;
  if (!handover?.payload) {
    console.warn('[amplitude-configurator] nothing to run: no configuration was handed over');
    return;
  }

  // The configuration arrived as JSON, so regexes came through as markers. The encoder is toJsonSafe()
  // in the configurator's extension-bridge.js — the two have to agree on this shape.
  const revive = (value) => {
    if (Array.isArray(value)) {
      return value.map(revive);
    }
    if (value !== null && typeof value === 'object') {
      if (typeof value.__regex === 'string') {
        return new RegExp(value.__regex, value.__flags);
      }
      return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, revive(nested)]));
    }
    return value;
  };

  // The policy was taken off this tab before the page loaded, so what follows is not what the site would do
  // on its own. Whether that mattered is worth saying out loud either way.
  if (handover.csp?.blocked.length) {
    console.warn(
      `[amplitude-configurator] ${handover.csp.summary} It was removed for this tab, so this run says nothing` +
        ' about whether the site can run Amplitude as it stands.',
      handover.csp.policy,
    );
  } else if (handover.csp) {
    console.log(`[amplitude-configurator] ${handover.csp.summary}`, handover.csp.policy);
  }

  const { payload } = handover;
  const { apiKey } = payload;
  const config = revive(payload.analytics);
  const replayOptions = payload.sessionReplay ? revive(payload.sessionReplay) : null;

  // Every event the SDK builds, whether or not it can be uploaded. The postMessage is the seam a
  // devtools panel would read.
  const eventLogPlugin = {
    name: 'configurator-event-log',
    type: 'enrichment',
    setup: async () => undefined,
    execute: async (event) => {
      console.log('[amplitude-configurator]', event.event_type, event);
      window.postMessage({ source: 'amplitude-configurator-events', event }, window.location.origin);
      return event;
    },
  };

  const client = window.amplitude.createInstance('configuratorRun');

  // Give the page its global back before doing anything else. The bundle merged itself onto whatever was
  // there, which on a site already running Amplitude means its init and track now point at the instance
  // the bundle brought with it.
  if (handover.hadGlobal) {
    Object.assign(window.amplitude, handover.properties);
  } else {
    delete window.amplitude;
  }

  client.add(eventLogPlugin);
  client.init(apiKey, config);

  if (replayOptions) {
    if (window.sessionReplay?.plugin) {
      client.add(window.sessionReplay.plugin(replayOptions));
    } else {
      console.warn('[amplitude-configurator] session replay was configured but its bundle is missing');
    }
  }

  // Left behind deliberately: this is a debugging tool, and the console is where it gets debugged from.
  window.__amplitudeConfiguratorClient = client;
  console.log('[amplitude-configurator] initialised', { apiKey, config, sessionReplay: replayOptions });
})();
