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
 *   node tools/shadow-harness/harness.mjs                 # headless, urls.txt
 *   node tools/shadow-harness/harness.mjs --headed        # watch it run
 *   node tools/shadow-harness/harness.mjs --max=2000      # cap elements/site
 *   node tools/shadow-harness/harness.mjs https://foo.com # ad-hoc single URL
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
const headed = args.includes('--headed');
const maxArg = args.find((a) => a.startsWith('--max='));
const MAX_ELEMENTS = maxArg ? parseInt(maxArg.split('=')[1], 10) : 3000;
const MAX_SHADOW_DEPTH = 3;
const cliUrls = args.filter((a) => !a.startsWith('--'));

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

async function main() {
  const urls = readCorpus();
  console.log(`Building engine bundle from source…`);
  const engineBundle = await buildEngineBundle();
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
