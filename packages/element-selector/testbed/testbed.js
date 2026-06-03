/**
 * Testbed entry point.
 *
 * Imports the real, built `@amplitude/element-selector` engine from
 * `../lib/esm/index.js` so this page exercises exactly the code that ships
 * to consumers — no parallel hand-rolled implementation that can drift.
 *
 * Wiring:
 *   - Renders every scenario from scenarios.js into its own sandbox card
 *   - Captures clicks anywhere inside a sandbox, runs engine.generate(target)
 *   - Updates the "Last click" panel with selector + strategy + round-trip
 *   - Pipes the engine's ILogger output into the diagnostic panel
 *   - Lets you edit the resolved config as JSON and live-apply it
 *
 * No build step on the testbed side — this is a plain ES module. The pnpm
 * `testbed` script ensures the package is built first so this file's imports
 * resolve.
 */

import {
  createSelectorEngine,
  resolveSelectorConfig,
  DEFAULT_RESOLVED_CONFIG,
} from '../lib/esm/index.js';

import { SCENARIOS } from './scenarios.js';
import { legacyCssPath } from './legacy-css-path.js';

// ---------- Logger that fans out to the diagnostic panel ----------

const loggerStreamEl = document.getElementById('logger-stream');

function appendLog(level, args) {
  const message = args.map((a) => (typeof a === 'string' ? a : String(a))).join(' ');
  // Filter: only show messages from our package, ignore stray console noise
  if (!message.includes('@amplitude/element-selector')) return;
  const li = document.createElement('li');
  li.classList.add('log-line', `log-${level}`);
  const time = new Date().toLocaleTimeString();
  li.innerHTML = `<span class="log-time">${time}</span><span class="log-level">${level.toUpperCase()}</span><span class="log-message"></span>`;
  li.querySelector('.log-message').textContent = message;
  loggerStreamEl.appendChild(li);
  loggerStreamEl.scrollTop = loggerStreamEl.scrollHeight;
}

const panelLogger = {
  log: (...args) => appendLog('log', args),
  warn: (...args) => appendLog('warn', args),
  error: (...args) => appendLog('error', args),
  debug: (...args) => appendLog('debug', args),
  disable: () => {},
  enable: () => {},
};

document.getElementById('logger-clear').addEventListener('click', () => {
  loggerStreamEl.innerHTML = '';
});

// ---------- Engine instance (re-created when config changes) ----------

let currentConfig = resolveSelectorConfig({ enabled: true }, panelLogger);
let engine = createSelectorEngine(currentConfig, { logger: panelLogger });

// ---------- Autogen-id regenerator ----------
//
// Simulates what real frameworks do across re-mounts: every session, React's
// useId emits a new `:rN:`, Radix produces a fresh `radix-XXXX`, MUI cycles
// its `mui-NNN`, etc. The testbed mimics that here so the cross-session
// aggregation can show what fraction of selectors stay stable.
//
// Order matters in this list — more specific patterns first. Each pattern
// has a replacer that emits a fresh equivalent on each call.

const AUTOGEN_REGEN_RULES = [
  // React useId: ":r5:", ":r10:", ":rk:" — any letters/digits between colons
  { pattern: /:r[0-9a-z]+:/g, regen: () => `:r${randInt(0, 9999).toString(36)}:` },
  // Radix-prefixed ids: "radix-A1B2", "radix-1B2C3D" — random hex-ish suffix
  { pattern: /radix-[A-Za-z0-9]+/g, regen: () => `radix-${randHex(6)}` },
  // MUI internal id prefix: "mui-12345"
  { pattern: /mui-\d+/g, regen: () => `mui-${randInt(10000, 99999)}` },
  // Hex-ish / library-generated suffixes — e.g. Swiper's
  // "swiper-wrapper-2e110fa710fd7e41039". Match prefix-suffix where the
  // suffix is alphanumeric and contains a 4+ digit run somewhere. This
  // mirrors v1's autogen-id detector (`/\d{4,}/`) — anything v1 would
  // filter, the regenerator changes between sessions so the legacy
  // algorithm has to deal with the churn. Listed BEFORE the pure-digit
  // rules below since this pattern is the most permissive.
  {
    pattern: /\b([a-zA-Z][a-zA-Z-]*)-([a-zA-Z0-9]*\d{4,}[a-zA-Z0-9]*)\b/g,
    regen: (_m, prefix) => `${prefix}-${randHex(6)}${randInt(10000, 99999)}${randHex(5)}`,
  },
  // Trailing timestamp suffix: "session-1700000000", "row-20250515".
  // Match prefix-followed-by-8+-trailing-digits, with a word boundary to
  // avoid eating across attribute boundaries.
  { pattern: /\b([a-zA-Z][a-zA-Z-]*)-(\d{8,})\b/g, regen: (_m, prefix) => `${prefix}-${randInt(10 ** 9, 10 ** 10 - 1)}` },
  // Generic 4-digit-suffixed ids: "dynamic-cta-1234", "row-9999"
  { pattern: /\b([a-zA-Z][a-zA-Z-]*)-(\d{4,7})\b/g, regen: (_m, prefix) => `${prefix}-${randInt(1000, 9999)}` },
];

function regenerateAutogenIds(html) {
  let next = html;
  for (const { pattern, regen } of AUTOGEN_REGEN_RULES) {
    next = next.replace(pattern, regen);
  }
  return next;
}

function randInt(low, high) {
  return Math.floor(Math.random() * (high - low + 1)) + low;
}

function randHex(n) {
  let s = '';
  for (let i = 0; i < n; i++) s += randInt(0, 15).toString(16);
  return s;
}

// ---------- Engine vs. legacy router ----------
//
// In production the autocapture plugin will branch on `config.enabled`:
//
//     selector = config.enabled ? engine.generate(target) : legacyCssPath(target);
//
// The testbed mirrors that decision so flipping `enabled` in the editor shows
// the actual user-visible effect of the kill switch — not just a no-op.

function generateSelector(target) {
  if (currentConfig.enabled) {
    return { selector: engine.generate(target), source: 'v1-engine' };
  }
  return { selector: legacyCssPath(target), source: 'legacy-cssPath' };
}

// ---------- Mode pill ----------

const modePillEl = document.getElementById('mode-pill');
function refreshModePill() {
  if (!modePillEl) return;
  const enabled = currentConfig.enabled;
  modePillEl.textContent = enabled ? 'v1 engine active' : 'legacy cssPath fallback';
  modePillEl.classList.toggle('mode-on', enabled);
  modePillEl.classList.toggle('mode-off', !enabled);
}

// ---------- Last-click panel ----------

const lcTag = document.getElementById('lc-tag');
const lcStrategy = document.getElementById('lc-strategy');
const lcSelector = document.getElementById('lc-selector');
const lcRoundtrip = document.getElementById('lc-roundtrip');

function inferStrategy(selector, source) {
  if (source === 'legacy-cssPath') {
    return 'legacy cssPath (enabled = false)';
  }
  // Cheap pattern-match against the orchestrator's output shape. The engine
  // doesn't expose which strategy won; this is a UI affordance, not load-
  // bearing logic.
  if (selector.startsWith('[data-amp-track-id=') || selector.startsWith('[')) {
    return 'explicitTrackingAttribute (or attribute selector)';
  }
  if (/^[a-z]+#[\w\-\\]+/.test(selector)) {
    return 'stableId';
  }
  return 'fallback (positional walk)';
}

function updateLastClickPanel(target, selector, scope, source) {
  lcTag.textContent = target.tagName.toLowerCase();
  lcStrategy.textContent = inferStrategy(selector, source);
  lcSelector.textContent = selector;

  let roundtripOk = false;
  try {
    const match = scope.querySelector(selector);
    roundtripOk = match === target;
  } catch (_e) {
    roundtripOk = false;
  }
  lcRoundtrip.textContent = roundtripOk ? '✓ resolves back to clicked element' : '✗ does NOT round-trip';
  lcRoundtrip.classList.toggle('ok', roundtripOk);
  lcRoundtrip.classList.toggle('bad', !roundtripOk);
}

// ---------- Cross-session aggregation simulator ----------
//
// For each scenario, this re-renders the HTML N times with autogen ids
// regenerated between each render — mimicking what frameworks do on remount
// or page reload — and tallies the distinct selectors emitted by each
// algorithm. The result is a stability score: how many distinct selectors
// did each algorithm produce across N sessions?
//
//   - 1 / N = perfectly stable (every session produces the same selector)
//   - N / N = perfectly unstable (every session produces a different one)
//
// This is the central proof of the v1 design: legacy cssPath will tend
// toward N/N on scenarios with autogen ids; v1 filters those ids out and
// stays at 1/N.

const SESSIONS_PER_RUN = 10;

function simulateSessions(scenario, n = SESSIONS_PER_RUN) {
  const v1 = new Set();
  const legacy = new Set();
  // Off-screen sandbox so the simulation doesn't disturb the visible grid.
  const offscreen = document.createElement('div');
  offscreen.style.position = 'absolute';
  offscreen.style.left = '-99999px';
  offscreen.style.top = '0';
  document.body.appendChild(offscreen);
  try {
    for (let i = 0; i < n; i++) {
      offscreen.innerHTML = regenerateAutogenIds(scenario.html);
      const target = offscreen.querySelector(scenario.targetSelector);
      if (!target) continue;
      v1.add(engine.generate(target));
      legacy.add(legacyCssPath(target));
    }
  } finally {
    offscreen.remove();
  }
  return { v1, legacy, total: n };
}

function renderAggregationResult(card, result) {
  const v1Stable = result.v1.size === 1;
  const legacyStable = result.legacy.size === 1;
  const v1Cell = card.querySelector('.agg-v1');
  const legacyCell = card.querySelector('.agg-legacy');
  v1Cell.textContent = `${result.v1.size} of ${result.total} distinct`;
  legacyCell.textContent = `${result.legacy.size} of ${result.total} distinct`;
  v1Cell.classList.toggle('ok', v1Stable);
  v1Cell.classList.toggle('bad', !v1Stable);
  legacyCell.classList.toggle('ok', legacyStable);
  legacyCell.classList.toggle('bad', !legacyStable);
}

// ---------- Scenarios grid ----------

const scenariosGridEl = document.getElementById('scenarios-grid');

function renderScenarios() {
  scenariosGridEl.innerHTML = '';
  for (const scenario of SCENARIOS) {
    const card = document.createElement('article');
    card.className = 'scenario-card';
    card.dataset.scenario = scenario.name;
    card.innerHTML = `
      <header>
        <h3>${scenario.name}</h3>
        <p>${scenario.exercises}</p>
      </header>
      <div class="sandbox" data-scenario="${scenario.name}"></div>
      <dl class="scenario-emit">
        <dt>v1 engine</dt>
        <dd><code class="emit-v1" data-scenario="${scenario.name}">—</code></dd>
        <dt>legacy cssPath</dt>
        <dd><code class="emit-legacy" data-scenario="${scenario.name}">—</code></dd>
      </dl>
      <div class="aggregation">
        <button type="button" class="aggregation-run secondary" data-scenario="${scenario.name}">
          Run ${SESSIONS_PER_RUN} sessions
        </button>
        <dl class="aggregation-result">
          <dt>v1 stability</dt>
          <dd><span class="agg-v1">—</span></dd>
          <dt>legacy stability</dt>
          <dd><span class="agg-legacy">—</span></dd>
        </dl>
      </div>
    `;
    const sandbox = card.querySelector('.sandbox');
    sandbox.innerHTML = scenario.html;
    // Highlight the canonical target for the scenario
    const target = sandbox.querySelector(scenario.targetSelector);
    if (target) target.classList.add('canonical-target');
    scenariosGridEl.appendChild(card);

    // Eagerly emit BOTH algorithms' selectors for the canonical target so
    // the card shows the side-by-side diff without requiring a click.
    // These render regardless of the enabled flag — the kill switch only
    // affects which one drives the "Last click" panel and aggregation.
    if (target) {
      paintScenarioEmissions(card, target);
    }
  }
}

function paintScenarioEmissions(card, target) {
  const v1 = engine.generate(target);
  const leg = legacyCssPath(target);
  card.querySelector('.emit-v1').textContent = v1;
  card.querySelector('.emit-legacy').textContent = leg;
}

// Click on a per-card aggregation button → run sessions for that scenario.
scenariosGridEl.addEventListener('click', (event) => {
  const button = event.target.closest('.aggregation-run');
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  const scenarioName = button.dataset.scenario;
  const scenario = SCENARIOS.find((s) => s.name === scenarioName);
  if (!scenario) return;
  const card = button.closest('.scenario-card');
  const result = simulateSessions(scenario);
  renderAggregationResult(card, result);
});

// Global "Run for all scenarios" button at the top of the grid.
const runAllEl = document.getElementById('aggregation-run-all');
if (runAllEl) {
  runAllEl.addEventListener('click', () => {
    for (const card of scenariosGridEl.querySelectorAll('.scenario-card')) {
      const scenarioName = card.dataset.scenario;
      const scenario = SCENARIOS.find((s) => s.name === scenarioName);
      if (!scenario) continue;
      const result = simulateSessions(scenario);
      renderAggregationResult(card, result);
    }
  });
}

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// ---------- Click handling ----------

document.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;

  // Find the sandbox the click happened inside; ignore clicks elsewhere
  const sandbox = target.closest('.sandbox');
  if (!sandbox) return;

  // Ignore clicks on the sandbox container itself — that's "outside" any
  // scenario content
  if (target === sandbox) return;

  event.preventDefault();
  const { selector, source } = generateSelector(target);
  updateLastClickPanel(target, selector, sandbox, source);

  // Repaint the per-card v1-vs-legacy emissions for the clicked element so
  // both rows reflect what each algorithm would say about THIS element, not
  // just the canonical target. Inside a scenario card the card has the
  // matching emit-v1 / emit-legacy nodes; the free-form playground doesn't.
  const card = target.closest('.scenario-card');
  if (card) {
    paintScenarioEmissions(card, target);
  }
});

// ---------- Free-form playground ----------

const playgroundHtmlEl = document.getElementById('playground-html');
const playgroundOutputEl = document.getElementById('playground-output');
document.getElementById('playground-render').addEventListener('click', () => {
  playgroundOutputEl.innerHTML = playgroundHtmlEl.value;
});
// Initial render
playgroundOutputEl.innerHTML = playgroundHtmlEl.value;

// ---------- Remote-config editor ----------

const configEditorEl = document.getElementById('config-editor');
const configErrorEl = document.getElementById('config-error');

function configToEditorJson(cfg) {
  // RegExp instances don't serialize natively — surface them as their source
  // string so the user can edit them as text. We round-trip through
  // resolveSelectorConfig on apply, which re-compiles from strings.
  return JSON.stringify(
    {
      enabled: cfg.enabled,
      explicitTrackingAttribute: cfg.explicitTrackingAttribute,
      autogeneratedIdPatterns: cfg.autogeneratedIdPatterns.map((re) => re.source),
      unstableClassPatterns: cfg.unstableClassPatterns.map((re) => re.source),
      maxAncestorWalkDepth: cfg.maxAncestorWalkDepth ?? null,
    },
    null,
    2,
  );
}

function loadDefaultsIntoEditor() {
  configEditorEl.value = configToEditorJson(resolveSelectorConfig({ enabled: true }, panelLogger));
}

document.getElementById('config-reset').addEventListener('click', () => {
  loadDefaultsIntoEditor();
  applyConfig();
});

document.getElementById('config-apply').addEventListener('click', applyConfig);

function applyConfig() {
  configErrorEl.hidden = true;
  configErrorEl.textContent = '';
  let parsed;
  try {
    parsed = JSON.parse(configEditorEl.value);
  } catch (e) {
    configErrorEl.hidden = false;
    configErrorEl.textContent = `JSON parse error: ${e instanceof Error ? e.message : String(e)}`;
    return;
  }
  // Coerce null → undefined for maxAncestorWalkDepth, since JSON has no
  // undefined and we serialized it as null in the editor.
  if (parsed.maxAncestorWalkDepth === null) delete parsed.maxAncestorWalkDepth;
  currentConfig = resolveSelectorConfig(parsed, panelLogger);
  engine.updateConfig(currentConfig);
  refreshModePill();
  // Re-emit selectors across the page now that the config has changed
  renderScenarios();
  // Reset the last-click panel since old emission is stale
  lcTag.textContent = '—';
  lcStrategy.textContent = '—';
  lcSelector.textContent = '—';
  lcRoundtrip.textContent = '—';
  lcRoundtrip.classList.remove('ok', 'bad');
}

// ---------- Boot ----------

loadDefaultsIntoEditor();
refreshModePill();
renderScenarios();
