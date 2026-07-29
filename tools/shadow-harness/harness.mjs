/**
 * Multi-site shadow-DOM safety & correctness harness.
 *
 * For every URL in `urls.txt` it:
 *   1. Injects the real shadow engine + capture helpers (bundled from source)
 *      BEFORE any page script runs, via `addInitScript`.
 *   2. Loads the page and forces shadow piercing ON (config override).
 *   3. Walks the live DOM — light + open shadow roots — and asserts the core
 *      round-trip invariant: resolveSelector(engine.generate(el)) === el.
 *   4. Exercises the capture-side helpers (querySelectorAllDeep,
 *      collectOpenShadowRoots, getClosestElement, getAncestors) over the real
 *      DOM to prove none of them throw.
 *   5. Records ANY uncaught page error (window.onerror / pageerror) — the core
 *      "never break a customer site" guarantee.
 *
 * Pass criteria per site: zero uncaught errors AND zero round-trip failures.
 * A JSON report is written to ./report.json.
 *
 * Usage:
 *   node tools/shadow-harness/harness.mjs                 # headless audit, urls.txt
 *   node tools/shadow-harness/harness.mjs --headed        # watch the audit run
 *   node tools/shadow-harness/harness.mjs --max=2000      # cap elements/site
 *   node tools/shadow-harness/harness.mjs https://foo.com # ad-hoc single URL
 *
 * Interactive mode — click around a live page and watch the REAL click and
 * exposure observables fire, each with its engine-generated selector:
 *   node tools/shadow-harness/harness.mjs --interactive https://foo.com
 *   node tools/shadow-harness/harness.mjs -i               # every URL in urls.txt, one tab at a time
 * An on-page HUD (top-right) lists each emitted event; the same lines are
 * mirrored to the terminal. Close the tab/window (or Ctrl-C) to advance/exit.
 * Exposure is GATED to match production (isIntersecting + 150ms dwell + dedupe),
 * so the list reflects what the SDK would report. Add `--raw-exposure` to see
 * the ungated observable firehose (every allowlisted element, on- or off-screen)
 * for debugging the observable itself.
 *
 * Differential invariant check (CI-friendly, no prod comparison, no golden) —
 * for every element it generates all four config combinations (legacy/new ×
 * shadow off/on) on one DOM snapshot and asserts:
 *   A. shadow flag is a no-op for light-DOM elements (on === off), and
 *   B. selectors round-trip (scoped by capability: shadow-off only for light DOM).
 * legacy≠new differences are reported (expected), never failed. Writes
 * ./diff-report.json and exits non-zero on any invariant failure:
 *   node tools/shadow-harness/harness.mjs --diff            # headless, urls.txt
 *   node tools/shadow-harness/harness.mjs --diff https://foo.com
 *
 * Prereqs: `pnpm build` (so workspace deps resolve), and Playwright browsers
 * installed (`npx playwright install chromium`).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import esbuild from 'esbuild';
import { chromium } from '@playwright/test';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_ALLOWLIST = [
  'a',
  'button',
  'input',
  'select',
  'textarea',
  'label',
  'video',
  'audio',
  '[contenteditable]',
  '[data-amp-default-track]',
  '.amp-default-track',
];

// Well-known BENIGN browser noise that surfaces via window.onerror on many
// sites but is NOT an uncaught exception from any script. These must not fail a
// site — filtering them is what keeps the harness from crying wolf.
//   - "ResizeObserver loop ..." is a spec-defined notification (very common on
//     YouTube, Google, etc.) emitted by the page's own ResizeObserver usage.
//   - "Script error." is the opaque cross-origin error with no real detail.
const IGNORED_ERROR_PATTERNS = [
  /ResizeObserver loop/i,
  /^Script error\.?$/i,
  // Expected artifact of our broad `*.amplitude.com` block: blocking the SDK
  // script host (cdn.amplitude.com) means `window.amplitude` is never defined,
  // so a site's own code (e.g. GTM) that references the global throws. This is
  // a consequence of our safeguard, not our shadow code — our injected engine
  // never touches the bare `amplitude` global (it uses `window.__AMP_SHADOW__`).
  /amplitude is not defined/i,
];
const isIgnorableError = (message) => IGNORED_ERROR_PATTERNS.some((re) => re.test(message));

const args = process.argv.slice(2);
const interactive = args.includes('--interactive') || args.includes('-i');
const diff = args.includes('--diff'); // 4-mode differential invariant check
const rawExposure = args.includes('--raw-exposure'); // interactive: show ungated exposure firehose
const headed = args.includes('--headed') || interactive; // interactive is always headed
const maxArg = args.find((a) => a.startsWith('--max='));
const MAX_ELEMENTS = maxArg ? parseInt(maxArg.split('=')[1], 10) : 3000;
const MAX_SHADOW_DEPTH = 3;
const cliUrls = args.filter((a) => !a.startsWith('-'));

function readCorpus() {
  if (cliUrls.length) return cliUrls;
  return readFileSync(join(__dirname, 'urls.txt'), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

async function buildEngineBundle() {
  const result = await esbuild.build({
    entryPoints: [join(__dirname, 'engine-entry.js')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    write: false,
    logLevel: 'error',
  });
  return result.outputFiles[0].text;
}

/**
 * Runs INSIDE the page. Walks the composed tree, round-trips every element
 * through the engine, and exercises the capture helpers. Returns a plain report
 * object (must be JSON-serializable — no DOM nodes cross the boundary).
 */
function inPageAudit({ allowlist, maxElements, maxDepth }) {
  const api = window.__AMP_SHADOW__;
  const report = {
    totalElements: 0,
    tested: 0,
    capped: false,
    roundTripFailures: [],
    helperErrors: [],
    shadowRootsFound: 0,
    delimitedSelectors: 0,
  };
  if (!api) {
    report.helperErrors.push('window.__AMP_SHADOW__ was not injected');
    return report;
  }

  const engine = api.createSelectorEngine(
    api.resolveSelectorConfig({ enabled: true, shadowDomEnabled: true, maxShadowDomDepth: maxDepth }),
  );

  // Walk the FULL composed tree (bounded only by a high hard cap) so the shadow
  // root count is accurate, separating light-DOM from shadow-nested elements.
  // Round-trip testing is then capped at maxElements but PRIORITIZES the
  // shadow-nested elements — otherwise a huge light-DOM subtree could exhaust
  // the budget before we ever reach the shadow roots (which is the whole point).
  const HARD_WALK_CAP = 200000;
  const shadowElements = [];
  const lightElements = [];
  const stack = [[document.documentElement, false]];
  let walked = 0;
  while (stack.length && walked < HARD_WALK_CAP) {
    walked += 1;
    const [el, inShadow] = stack.pop();
    if (!el || el.nodeType !== 1) continue;
    (inShadow ? shadowElements : lightElements).push(el);
    if (el.shadowRoot) {
      report.shadowRootsFound += 1;
      for (const child of el.shadowRoot.children) stack.push([child, true]);
    }
    for (const child of el.children) stack.push([child, inShadow]);
  }
  report.totalElements = shadowElements.length + lightElements.length;
  report.shadowElements = shadowElements.length;

  // Test all shadow-nested elements first, then fill the remaining budget with
  // light-DOM elements.
  const elements = shadowElements.concat(lightElements).slice(0, maxElements);
  report.capped = report.totalElements > elements.length;

  for (const el of elements) {
    let selector;
    try {
      selector = engine.generate(el);
    } catch (e) {
      report.helperErrors.push(`generate threw: ${String(e && e.message)}`);
      continue;
    }
    report.tested += 1;
    if (selector.includes(api.SHADOW_BOUNDARY_DELIMITER)) report.delimitedSelectors += 1;
    let resolved = null;
    try {
      resolved = api.resolveSelector(document, selector);
    } catch (e) {
      report.helperErrors.push(`resolveSelector threw: ${String(e && e.message)}`);
      continue;
    }
    if (resolved !== el && report.roundTripFailures.length < 50) {
      // Diagnose WHY it failed so we can tell a real engine bug from live-DOM
      // churn. Re-walk to the final segment's scope and count how many elements
      // the last segment matches there:
      //   matchCount > 1  → the selector is NON-UNIQUE (engine correctness bug)
      //   matchCount === 1 but resolved !== el → likely the DOM mutated between
      //                     generate and resolve (live-page churn, not a bug)
      //   resolvedIsNull  → a segment matched nothing (mutation or bad segment)
      const segments = selector.split(api.SHADOW_BOUNDARY_DELIMITER);
      let scope = document;
      let scopeOk = true;
      for (let i = 0; i < segments.length - 1 && scopeOk; i++) {
        const host = scope.querySelector(segments[i].trim());
        if (host && host.shadowRoot) scope = host.shadowRoot;
        else scopeOk = false;
      }
      let matchCount = null;
      if (scopeOk) {
        try {
          matchCount = scope.querySelectorAll(segments[segments.length - 1].trim()).length;
        } catch {
          matchCount = -1; // segment threw (malformed)
        }
      }
      report.roundTripFailures.push({
        selector,
        tag: el.tagName.toLowerCase(),
        id: el.id || undefined,
        pierced: segments.length > 1,
        matchCount,
        resolvedIsNull: resolved === null,
        likelyCause: matchCount > 1 ? 'non-unique-selector' : resolved === null ? 'segment-missed' : 'dom-mutation',
      });
    }
  }

  // Exercise the capture-side helpers over the real DOM — must never throw.
  const selectorString = allowlist.join(',');
  try {
    api.querySelectorAllDeep(document, selectorString, maxDepth);
  } catch (e) {
    report.helperErrors.push(`querySelectorAllDeep threw: ${String(e && e.message)}`);
  }
  try {
    api.collectOpenShadowRoots(document.documentElement, maxDepth);
  } catch (e) {
    report.helperErrors.push(`collectOpenShadowRoots threw: ${String(e && e.message)}`);
  }
  // Sample a handful of allowlisted elements for the ancestor/closest walks.
  let sampled = 0;
  for (const el of elements) {
    if (sampled >= 100) break;
    if (!allowlist.some((s) => el.matches?.(s))) continue;
    sampled += 1;
    try {
      api.getClosestElement(el, allowlist, true, maxDepth);
      api.getAncestors(el, true, maxDepth);
    } catch (e) {
      report.helperErrors.push(`ancestor/closest walk threw: ${String(e && e.message)}`);
      break;
    }
  }

  return report;
}

/**
 * Runs INSIDE the page. Differential invariant check across the full 2×2 config
 * matrix — {legacy, new} × {shadow off, shadow on} — over one DOM snapshot.
 *
 * Asserts two properties that hold regardless of which algorithm is "correct",
 * so no golden output (and no prod comparison) is needed:
 *
 *   A. Shadow-flag no-op: for a light-DOM element the shadow flag must NOT
 *      change the selector (newOn === newOff, legacyOn === legacyOff). This is
 *      the "off path is byte-identical" guarantee. Only shadow-nested elements
 *      may differ between on/off.
 *   B. Round-trip, scoped by capability: shadow-ON selectors must resolve back
 *      to the element for every open-tree element; shadow-OFF selectors only for
 *      light-DOM elements (shadow-off genuinely cannot address shadow content).
 *
 * legacy-vs-new differences are EXPECTED (different algorithms) and only counted
 * for a migration report — never treated as a failure.
 */
function inPageDiff({ maxElements, maxDepth }) {
  const api = window.__AMP_SHADOW__;
  const report = {
    totalElements: 0,
    shadowElements: 0,
    tested: 0,
    capped: false,
    generateErrors: [],
    shadowFlagMismatches: [], // GATE: light-DOM element whose selector changed with the shadow flag
    roundTripFailures: [], // GATE: selector that didn't resolve back (churn-filtered)
    legacyVsNewDiffs: 0, // REPORT ONLY
    legacyVsNewExamples: [],
    piercedSelectors: 0,
  };
  if (!api) {
    report.generateErrors.push('window.__AMP_SHADOW__ was not injected');
    return report;
  }

  const mk = (enabled, shadow) =>
    api.createSelectorEngine(
      api.resolveSelectorConfig({ enabled, shadowDomEnabled: shadow, maxShadowDomDepth: maxDepth }),
    );
  const engines = { legacyOff: mk(false, false), legacyOn: mk(false, true), newOff: mk(true, false), newOn: mk(true, true) };

  // Walk the composed tree, tagging each element with whether it lives inside a
  // shadow root. Prioritize shadow-nested elements under the cap (same rationale
  // as inPageAudit) so shadow coverage isn't starved by a large light-DOM tree.
  const HARD_WALK_CAP = 200000;
  const shadowEls = [];
  const lightEls = [];
  const stack = [[document.documentElement, false]];
  let walked = 0;
  while (stack.length && walked < HARD_WALK_CAP) {
    walked += 1;
    const [el, inShadow] = stack.pop();
    if (!el || el.nodeType !== 1) {
      continue;
    }
    (inShadow ? shadowEls : lightEls).push(el);
    if (el.shadowRoot) {
      for (const child of el.shadowRoot.children) stack.push([child, true]);
    }
    for (const child of el.children) stack.push([child, inShadow]);
  }
  report.totalElements = shadowEls.length + lightEls.length;
  report.shadowElements = shadowEls.length;
  const elements = shadowEls
    .map((el) => [el, true])
    .concat(lightEls.map((el) => [el, false]))
    .slice(0, maxElements);
  report.capped = report.totalElements > elements.length;

  const rt = (selector, el) => {
    try {
      return api.resolveSelector(document, selector) === el;
    } catch {
      return false;
    }
  };

  for (const [el, inShadow] of elements) {
    let sNewOn, sNewOff, sLegOn, sLegOff;
    try {
      sNewOn = engines.newOn.generate(el);
      sNewOff = engines.newOff.generate(el);
      sLegOn = engines.legacyOn.generate(el);
      sLegOff = engines.legacyOff.generate(el);
    } catch (e) {
      report.generateErrors.push(`generate threw: ${String(e && e.message)}`);
      continue;
    }
    report.tested += 1;
    if (sNewOn.includes(api.SHADOW_BOUNDARY_DELIMITER)) {
      report.piercedSelectors += 1;
    }

    // Gate A — shadow flag must be a no-op for light-DOM elements.
    if (!inShadow) {
      if (sNewOn !== sNewOff && report.shadowFlagMismatches.length < 50) {
        report.shadowFlagMismatches.push({ algo: 'new', tag: el.tagName.toLowerCase(), off: sNewOff, on: sNewOn });
      }
      if (sLegOn !== sLegOff && report.shadowFlagMismatches.length < 50) {
        report.shadowFlagMismatches.push({ algo: 'legacy', tag: el.tagName.toLowerCase(), off: sLegOff, on: sLegOn });
      }
    }

    // Gate B — round-trip, scoped by capability. `el.isConnected` filters out
    // elements that were detached by live-page churn between generate and
    // resolve (a false failure, not an engine bug).
    const checkRt = (mode, selector, expected) => {
      if (!expected) {
        return;
      }
      if (!rt(selector, el) && el.isConnected && report.roundTripFailures.length < 50) {
        report.roundTripFailures.push({ mode, tag: el.tagName.toLowerCase(), inShadow, selector });
      }
    };
    checkRt('newOn', sNewOn, true); // shadow-on must address every open-tree element
    checkRt('legacyOn', sLegOn, true);
    checkRt('newOff', sNewOff, !inShadow); // shadow-off only expected to address light DOM
    checkRt('legacyOff', sLegOff, !inShadow);

    // Report — legacy vs new (expected to differ; migration signal only).
    if (sNewOn !== sLegOn) {
      report.legacyVsNewDiffs += 1;
      if (report.legacyVsNewExamples.length < 20) {
        report.legacyVsNewExamples.push({ tag: el.tagName.toLowerCase(), inShadow, legacy: sLegOn, engine: sNewOn });
      }
    }
  }

  return report;
}

/**
 * Runs INSIDE the page (via addInitScript, so it survives same-tab navigations).
 * Subscribes to the REAL click and exposure observables and, for every emitted
 * event, generates the selector with the real engine — resolving the true
 * clicked element from `composedPath()[0]` and the tracked ancestor via
 * `getClosestElement`, exactly as `data-extractor` does at runtime. Renders a
 * HUD and mirrors each line to the console (prefixed `[AMP]`) so the Node side
 * can print it. Self-contained: references only `window` and its `config` arg.
 */
function inPageInteractive(config) {
  const api = window.__AMP_SHADOW__;
  if (!api || !api.createClickObservable || window.__ampInteractiveWired) {
    return;
  }
  window.__ampInteractiveWired = true;

  const { allowlist, maxDepth } = config;
  const engine = api.createSelectorEngine(
    api.resolveSelectorConfig({ enabled: true, shadowDomEnabled: true, maxShadowDomDepth: maxDepth }),
  );
  const getShadowConfig = () => ({ enabled: true, maxDepth });

  const safeGenerate = (el) => {
    if (!el || el.nodeType !== 1) {
      return '(no element)';
    }
    try {
      return engine.generate(el);
    } catch (e) {
      return 'generate threw: ' + String(e && e.message);
    }
  };
  const roundTrips = (selector, el) => {
    try {
      return api.resolveSelector(document, selector) === el;
    } catch {
      return false;
    }
  };

  // ---- HUD ----------------------------------------------------------------
  // Attached to <html> (not <body>) so it exists even before body parses, and
  // pointer-events:none so it never intercepts the clicks we're measuring.
  const hud = document.createElement('div');
  hud.setAttribute('data-amp-harness-hud', '');
  hud.style.cssText = [
    'position:fixed', 'top:8px', 'right:8px', 'z-index:2147483647',
    'width:440px', 'max-height:80vh', 'overflow:auto', 'pointer-events:none',
    'font:12px/1.4 ui-monospace,Menlo,Consolas,monospace',
    'background:rgba(17,17,17,.92)', 'color:#eee', 'border-radius:8px',
    'padding:8px 10px', 'box-shadow:0 4px 20px rgba(0,0,0,.5)',
  ].join(';');
  const header = document.createElement('div');
  header.style.cssText = 'font-weight:700;margin-bottom:6px;color:#7ee787';
  header.textContent = 'AMP shadow harness — click / exposure';
  hud.appendChild(header);
  const list = document.createElement('div');
  hud.appendChild(list);
  const mountHud = () => (document.body || document.documentElement).appendChild(hud);
  if (document.documentElement) {
    mountHud();
  }

  let counts = { click: 0, exposure: 0 };
  const seen = new Map(); // "kind|selector" -> row element (dedupe exposure spam)

  const addRow = (kind, selector, ok, extra) => {
    counts[kind] += 1;
    header.textContent = `AMP harness — ${counts.click} click, ${counts.exposure} exposure`;
    // Mirror to the console for the terminal, then update the HUD.
    // eslint-disable-next-line no-console
    console.log(`[AMP] ${kind.toUpperCase()} ${ok ? 'ok ' : 'X  '}${selector}${extra ? '  ' + extra : ''}`);

    const key = kind + '|' + selector;
    const existing = seen.get(key);
    if (existing) {
      existing.count += 1;
      existing.badge.textContent = 'x' + existing.count;
      list.prepend(existing.row); // bump to top
      return;
    }
    const row = document.createElement('div');
    row.style.cssText = 'margin-bottom:5px;padding:4px 6px;border-radius:5px;background:rgba(255,255,255,.05);word-break:break-all';
    const color = kind === 'click' ? '#79c0ff' : '#d2a8ff';
    row.innerHTML =
      `<span style="color:${color};font-weight:700">${kind}</span> ` +
      `<span style="color:${ok ? '#7ee787' : '#ff7b72'}">${ok ? '✓ round-trips' : '✗ no round-trip'}</span>` +
      (extra ? ` <span style="color:#8b949e">${extra}</span>` : '') +
      `<span data-badge style="float:right;color:#8b949e"></span>` +
      `<div style="margin-top:2px;color:#eee">${selector.replace(/</g, '&lt;')}</div>`;
    const badge = row.querySelector('[data-badge]');
    seen.set(key, { row, badge, count: 1 });
    list.prepend(row);
    while (list.children.length > 40) {
      const last = list.lastChild;
      list.removeChild(last);
    }
  };

  // ---- Clicks -------------------------------------------------------------
  api.createClickObservable('click').subscribe({
    next: (event) => {
      const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
      const target = (path && path[0]) || event.target;
      if (!target || target.nodeType !== 1 || hud.contains(target)) {
        return;
      }
      const selector = safeGenerate(target);
      let extra = target.tagName ? '&lt;' + target.tagName.toLowerCase() + '&gt;' : '';
      let tracked = null;
      try {
        tracked = api.getClosestElement(target, allowlist, true, maxDepth);
      } catch {
        /* ignore */
      }
      if (tracked && tracked !== target) {
        extra += ' → tracked: ' + safeGenerate(tracked).replace(/</g, '&lt;');
      }
      addRow('click', selector, roundTrips(selector, target), extra);
    },
  });

  // ---- Exposure -----------------------------------------------------------
  // Mirror the plugin's wiring: raw mutation observable → timestamped → the
  // exposure observable, which emits IntersectionObserver entries.
  //
  // The raw observable fires `next` for EVERY observed element — including
  // off-screen ones (the IntersectionObserver's initial callback reports every
  // element's current state). Production does NOT report those: `trackExposure`
  // gates each entry on `isIntersecting`, requires the element to stay visible
  // for EXPOSURE_DURATION, and dedupes — then batches the survivors into one
  // "Viewport Content Updated" event. We replicate that gating by default so the
  // HUD matches what the SDK would actually emit; `--raw-exposure` shows the
  // ungated firehose for debugging the observable itself.
  const EXPOSURE_DURATION = 150; // DEFAULT_EXPOSURE_DURATION
  const exposed = new Set(); // elements already reported (dedupe)
  const timers = new Map(); // element -> pending dwell timer
  const wireExposure = () => {
    const mutation = api.createMutationObservable(getShadowConfig).map((event) => ({ event, timestamp: Date.now() }));
    api.createExposureObservable(mutation, allowlist, getShadowConfig).subscribe({
      next: (entry) => {
        const target = entry && entry.target;
        if (!target || target.nodeType !== 1) {
          return;
        }
        const report = () => {
          const selector = safeGenerate(target);
          const extra = target.tagName ? '&lt;' + target.tagName.toLowerCase() + '&gt;' : '';
          addRow('exposure', selector, roundTrips(selector, target), extra);
        };
        if (config.rawExposure) {
          report();
          return;
        }
        // Gated path — mirrors track-exposure.ts.
        if (entry.isIntersecting) {
          if (!exposed.has(target) && !timers.has(target)) {
            timers.set(
              target,
              setTimeout(() => {
                exposed.add(target);
                timers.delete(target);
                report();
              }, EXPOSURE_DURATION),
            );
          }
        } else if (entry.intersectionRatio < 1.0) {
          const timer = timers.get(target);
          if (timer) {
            clearTimeout(timer);
            timers.delete(target);
          }
        }
      },
    });
  };
  if (document.body) {
    wireExposure();
  } else {
    document.addEventListener('DOMContentLoaded', wireExposure, { once: true });
  }
}

async function auditUrl(browser, url, engineBundle) {
  const context = await browser.newContext();
  const page = await context.newPage();

  // SAFETY: many target sites already ship a production Amplitude SDK, which
  // fires its normal events on page load. We must not pollute a customer's
  // Amplitude instance with our test visits, so abort every request to an
  // Amplitude ingestion host. The harness itself sends nothing (it only reads
  // the DOM — no init, no clicks), so this blocks purely the SITE's SDK.
  // NOTE: a customer that proxies ingestion through their own domain would not
  // be covered — prefer non-production URLs for those.
  const blocked = { count: 0 };
  await context.route(/https?:\/\/([a-z0-9-]+\.)*amplitude\.com\//i, (route) => {
    blocked.count += 1;
    return route.abort();
  });

  const pageErrors = [];
  const pageErrorDetails = [];
  page.on('pageerror', (err) => {
    pageErrors.push(err.message);
    // Capture the stack so we can attribute the error: a frame referencing our
    // injected engine (`__AMP_SHADOW__` / element-selector / autocapture) means
    // it's ours; otherwise it originated in the site's own code (incl. any
    // production Amplitude SDK the site already ships).
    const stack = String(err.stack || '');
    const ours = /__AMP_SHADOW__|element-selector|plugin-autocapture|createSelectorEngine|resolveSelector/.test(stack);
    pageErrorDetails.push({ message: err.message, attributedToHarness: ours, stack: stack.split('\n').slice(0, 6) });
  });

  // Capture window.onerror from our injected code too (belt and suspenders).
  await page.addInitScript(() => {
    window.__ampHarnessErrors = [];
    window.addEventListener('error', (e) => window.__ampHarnessErrors.push(String(e.message)));
  });
  await page.addInitScript({ content: engineBundle });

  const result = { url, ok: false, pageErrors, pageErrorDetails, blockedAmplitudeRequests: blocked, error: undefined, audit: undefined };
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    // Give late-loading web components a moment to mount.
    await page.waitForTimeout(4000);
    const audit = await page.evaluate(inPageAudit, {
      allowlist: DEFAULT_ALLOWLIST,
      maxElements: MAX_ELEMENTS,
      maxDepth: MAX_SHADOW_DEPTH,
    });
    const injectedErrors = await page.evaluate(() => window.__ampHarnessErrors || []);
    audit.injectedErrors = injectedErrors;
    result.audit = audit;

    // A site FAILS only on problems attributable to OUR injected code — not the
    // site's own bugs (incl. any production Amplitude SDK it already ships) and
    // not benign browser noise. This harness injects only the isolated engine,
    // so a pageerror is ours only if its stack references our code.
    const harnessPageErrors = pageErrorDetails.filter((d) => d.attributedToHarness && !isIgnorableError(d.message));
    const sitePageErrors = pageErrorDetails.filter((d) => !d.attributedToHarness && !isIgnorableError(d.message));
    const realInjectedErrors = injectedErrors.filter((m) => !isIgnorableError(m));
    // Only non-unique selectors are definitive engine bugs; dom-mutation /
    // segment-missed failures on a live page are reported as warnings.
    const engineRoundTripBugs = audit.roundTripFailures.filter((f) => f.likelyCause === 'non-unique-selector');

    result.harnessPageErrors = harnessPageErrors;
    result.sitePageErrors = sitePageErrors; // reported for context, do NOT fail us
    result.realInjectedErrors = realInjectedErrors;
    result.engineRoundTripBugs = engineRoundTripBugs;
    result.ignoredErrors = [...pageErrors, ...injectedErrors].filter(isIgnorableError);
    result.ok =
      harnessPageErrors.length === 0 &&
      realInjectedErrors.length === 0 &&
      audit.helperErrors.length === 0 &&
      engineRoundTripBugs.length === 0;
  } catch (e) {
    result.error = String(e && e.message);
  } finally {
    await context.close();
  }
  return result;
}

/**
 * Interactive session for one URL: inject the engine + the interactive
 * controller (both as init scripts so they survive same-tab navigation), mirror
 * the in-page `[AMP]` console lines to the terminal, and block until the user
 * closes the tab/window. Returns when the page closes.
 */
async function interactiveUrl(browser, url, engineBundle) {
  const context = await browser.newContext();
  const page = await context.newPage();

  // Same ingestion-host block as the audit path: never pollute a customer's
  // Amplitude instance with our test visit.
  await context.route(/https?:\/\/([a-z0-9-]+\.)*amplitude\.com\//i, (route) => route.abort());

  page.on('console', (msg) => {
    const text = msg.text();
    if (text.startsWith('[AMP]')) {
      console.log(text);
    }
  });
  page.on('pageerror', (err) => console.log(`  page error: ${err.message}`));

  await page.addInitScript({ content: engineBundle });
  await page.addInitScript(inPageInteractive, { allowlist: DEFAULT_ALLOWLIST, maxDepth: MAX_SHADOW_DEPTH, rawExposure });

  console.log(`\n→ ${url}`);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  } catch (e) {
    console.log(`  navigation error: ${String(e && e.message)}`);
  }
  console.log('  Click around — click / exposure events print here and in the on-page HUD.');
  console.log('  Close the tab or window to continue (Ctrl-C to quit).');

  // Block until the page/tab is closed by the user.
  await page.waitForEvent('close', { timeout: 0 }).catch(() => undefined);
  await context.close().catch(() => undefined);
}

async function runInteractive(engineBundle) {
  const urls = readCorpus();
  const browser = await chromium.launch({ headless: false });
  process.on('SIGINT', () => {
    browser.close().finally(() => process.exit(0));
  });
  console.log(`Interactive mode — ${urls.length} URL(s), shadow depth ${MAX_SHADOW_DEPTH}.`);
  for (const url of urls) {
    await interactiveUrl(browser, url, engineBundle);
  }
  await browser.close();
  console.log('\nDone.');
}

/** One-URL differential invariant check. Returns a JSON-serializable result. */
async function diffUrl(browser, url, engineBundle) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await context.route(/https?:\/\/([a-z0-9-]+\.)*amplitude\.com\//i, (route) => route.abort());
  await page.addInitScript({ content: engineBundle });

  const result = { url, ok: false, error: undefined, report: undefined };
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(4000); // let late web components mount
    const report = await page.evaluate(inPageDiff, { maxElements: MAX_ELEMENTS, maxDepth: MAX_SHADOW_DEPTH });
    result.report = report;
    result.ok =
      report.generateErrors.length === 0 &&
      report.shadowFlagMismatches.length === 0 &&
      report.roundTripFailures.length === 0;
  } catch (e) {
    result.error = String(e && e.message);
  } finally {
    await context.close();
  }
  return result;
}

async function runDiff(engineBundle) {
  const urls = readCorpus();
  console.log(`Differential check — ${urls.length} URL(s), shadow depth ${MAX_SHADOW_DEPTH}\n`);
  const browser = await chromium.launch({ headless: !headed });
  const results = [];
  for (const url of urls) {
    process.stdout.write(`→ ${url} … `);
    const r = await diffUrl(browser, url, engineBundle);
    results.push(r);
    if (r.error) {
      console.log(`ERROR (${r.error})`);
    } else {
      const rep = r.report;
      console.log(
        `${r.ok ? 'PASS' : 'FAIL'} — tested ${rep.tested}/${rep.totalElements}${rep.capped ? '+ (capped)' : ''}, ` +
          `${rep.shadowElements} shadow els, ${rep.piercedSelectors} pierced, ` +
          `${rep.shadowFlagMismatches.length} flag-mismatch, ${rep.roundTripFailures.length} round-trip fail, ` +
          `${rep.generateErrors.length} generate error(s) | ${rep.legacyVsNewDiffs} legacy≠new (expected)`,
      );
    }
  }
  await browser.close();
  writeFileSync(join(__dirname, 'diff-report.json'), JSON.stringify(results, null, 2));
  const failed = results.filter((r) => !r.ok);
  console.log(`\nDiff report written to tools/shadow-harness/diff-report.json`);
  console.log(`${results.length - failed.length}/${results.length} site(s) passed the invariant check.`);
  process.exit(failed.length ? 1 : 0);
}

async function main() {
  console.log(`Building engine bundle from source…`);
  const engineBundle = await buildEngineBundle();

  if (interactive) {
    await runInteractive(engineBundle);
    return;
  }

  if (diff) {
    await runDiff(engineBundle);
    return;
  }

  const urls = readCorpus();
  console.log(`Auditing ${urls.length} URL(s) (max ${MAX_ELEMENTS} elements each, shadow depth ${MAX_SHADOW_DEPTH})\n`);

  const browser = await chromium.launch({ headless: !headed });
  const results = [];
  for (const url of urls) {
    process.stdout.write(`→ ${url} … `);
    const r = await auditUrl(browser, url, engineBundle);
    results.push(r);
    if (r.error) {
      console.log(`ERROR (${r.error})`);
    } else {
      const a = r.audit;
      const ourErrors = (r.harnessPageErrors?.length || 0) + (r.realInjectedErrors?.length || 0);
      const siteErrors = r.sitePageErrors?.length || 0;
      const ignored = r.ignoredErrors?.length || 0;
      const bugs = r.engineRoundTripBugs?.length || 0;
      const churn = a.roundTripFailures.length - bugs;
      console.log(
        `${r.ok ? 'PASS' : 'FAIL'} — tested ${a.tested}/${a.totalElements}${a.capped ? '+ (capped)' : ''}, ` +
          `${a.shadowRootsFound} shadow roots (${a.shadowElements} shadow els), ${a.delimitedSelectors} pierced selectors, ` +
          `${bugs} engine bug(s)${churn ? ` + ${churn} churn/mutation` : ''}, ${a.helperErrors.length} helper error(s), ` +
          `${ourErrors} OUR error(s)${siteErrors ? `, ${siteErrors} site error(s)` : ''}${ignored ? `, ${ignored} benign` : ''}` +
          `, ${r.blockedAmplitudeRequests?.count || 0} amplitude req(s) blocked`,
      );
    }
  }
  await browser.close();

  writeFileSync(join(__dirname, 'report.json'), JSON.stringify(results, null, 2));
  const failed = results.filter((r) => !r.ok);
  console.log(`\nReport written to tools/shadow-harness/report.json`);
  console.log(`${results.length - failed.length}/${results.length} site(s) passed.`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
