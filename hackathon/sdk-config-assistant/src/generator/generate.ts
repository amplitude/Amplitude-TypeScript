import type { Answers, AutocaptureToggles } from '../types';
import { AUTOCAPTURE_INFO, AUTOCAPTURE_KEYS, SDK } from '../kb/knowledge';
import { BROWSER_SNIPPET_LOADER } from '../kb/snippet';
import { regexLiteral } from './regex';

export interface CodeBlock {
  lang: 'bash' | 'js' | 'html' | 'text';
  title: string;
  code: string;
}

export interface Artifact {
  headline: string;
  steps: { title: string; body?: string; block?: CodeBlock }[];
  decisions: { label: string; why: string }[];
}

export const defaultToggles = (): AutocaptureToggles => ({
  attribution: true,
  pageViews: true,
  sessions: true,
  formInteractions: true,
  fileDownloads: true,
  elementInteractions: false,
  webVitals: false,
  frustrationInteractions: false,
});

const isDefaultToggles = (t: AutocaptureToggles): boolean => {
  const d = defaultToggles();
  return AUTOCAPTURE_KEYS.every((k) => t[k] === d[k]);
};

/** Build the `autocapture` config value as pretty JS source lines. */
function autocaptureSource(a: Answers, indent: string): string[] | null {
  const toggles = a.autocapture === 'defaults' || !a.autocapture ? defaultToggles() : a.autocapture;
  const needsPvFilter = !!a.pageViewFilter && toggles.pageViews;
  const needsElAllow = a.elementPageUrlAllowlist.length > 0 && toggles.elementInteractions;
  const custom = !isDefaultToggles(toggles) || needsPvFilter || needsElAllow;
  if (!custom) return null;

  const lines: string[] = [`${indent}autocapture: {`];
  const inner = indent + '  ';
  for (const key of AUTOCAPTURE_KEYS) {
    const on = toggles[key];
    if (key === 'pageViews' && on && needsPvFilter && a.pageViewFilter) {
      lines.push(`${inner}pageViews: {`);
      lines.push(`${inner}  // only count a page view when the URL matches`);
      lines.push(`${inner}  trackOn: () => ${regexLiteral(a.pageViewFilter)}.test(window.location.href),`);
      lines.push(`${inner}},`);
      continue;
    }
    if (key === 'elementInteractions' && on && needsElAllow) {
      lines.push(`${inner}elementInteractions: {`);
      lines.push(`${inner}  // clicks are only tracked on pages matching these patterns`);
      lines.push(`${inner}  pageUrlAllowlist: [`);
      for (const p of a.elementPageUrlAllowlist) {
        lines.push(`${inner}    ${regexLiteral(p)}, // ${p.english}`);
      }
      lines.push(`${inner}  ],`);
      lines.push(`${inner}},`);
      continue;
    }
    if (on !== defaultToggles()[key]) {
      lines.push(`${inner}${key}: ${on},`);
    }
  }
  lines.push(`${indent}},`);
  return lines;
}

/** Options for plain amplitude.init (Browser SDK). */
function browserConfigSource(a: Answers, indent = '  '): string[] {
  const lines: string[] = [];
  if (a.serverZone === 'EU') {
    lines.push(`${indent}serverZone: 'EU', // send data to Amplitude's EU data center`);
  }
  const ac = autocaptureSource(a, indent);
  if (ac) lines.push(...ac);
  if (a.fetchRemoteConfig === false) {
    lines.push(`${indent}remoteConfig: {`);
    lines.push(
      `${indent}  fetchRemoteConfig: false, // ignore settings managed in the Amplitude app; code is source of truth`,
    );
    lines.push(`${indent}},`);
  }
  return lines;
}

const pmInstall = (a: Answers, pkg: string): string =>
  ({ npm: `npm install ${pkg}`, yarn: `yarn add ${pkg}`, pnpm: `pnpm add ${pkg}` }[a.packageManager]);

function browserInitJs(a: Answers): string {
  const cfg = browserConfigSource(a);
  const opts = cfg.length ? `, {\n${cfg.join('\n')}\n}` : '';
  return `import * as amplitude from '@amplitude/analytics-browser';\n\namplitude.init('YOUR_API_KEY'${opts});`;
}

/** Options for unified initAll — serverZone is TOP-LEVEL and shared across products. */
function unifiedOptionsSource(a: Answers, indent = '  '): string[] {
  const parts: string[] = [];
  if (a.serverZone === 'EU') {
    parts.push(`${indent}serverZone: 'EU', // shared by all products — EU data center`);
  }
  const analyticsCfg: string[] = [];
  const ac = autocaptureSource(a, indent + '  ');
  if (ac) analyticsCfg.push(...ac);
  if (a.fetchRemoteConfig === false) {
    analyticsCfg.push(`${indent}  remoteConfig: {`);
    analyticsCfg.push(`${indent}    fetchRemoteConfig: false, // ignore settings managed in the Amplitude app`);
    analyticsCfg.push(`${indent}  },`);
  }
  if (analyticsCfg.length) {
    parts.push(`${indent}analytics: {`);
    parts.push(...analyticsCfg);
    parts.push(`${indent}},`);
  }
  if (a.products.includes('sessionReplay')) {
    const rate = a.srSampleRate ?? 0.1;
    parts.push(`${indent}sessionReplay: {`);
    parts.push(`${indent}  // ⚠️ default is 0 — without this line nothing is recorded`);
    parts.push(`${indent}  sampleRate: ${rate}, // record ${+(rate * 100).toFixed(2)}% of sessions`);
    parts.push(`${indent}},`);
  }
  if (a.products.includes('experiment')) {
    parts.push(`${indent}experiment: {`);
    parts.push(`${indent}  // deploymentKey is optional — falls back to your analytics API key`);
    parts.push(`${indent}},`);
  }
  if (!a.products.includes('guidesSurveys')) {
    parts.push(`${indent}engagement: { skip: true }, // not using Guides & Surveys — don't load its bundle`);
  }
  return parts;
}

function unifiedInitJs(a: Answers): string {
  const parts = unifiedOptionsSource(a);
  const opts = parts.length ? `, {\n${parts.join('\n')}\n}` : '';
  return `import { initAll } from '@amplitude/unified';\n\ninitAll('YOUR_API_KEY'${opts});`;
}

const productNames: Record<string, string> = {
  analytics: 'Analytics',
  sessionReplay: 'Session Replay',
  experiment: 'Experiment',
  guidesSurveys: 'Guides & Surveys',
};

export function generate(a: Answers): Artifact {
  const products = a.products.map((p) => productNames[p]).join(' + ');
  const steps: Artifact['steps'] = [];
  const decisions: Artifact['decisions'] = [];
  const method = a.installMethod;

  let headline = 'Your Amplitude setup';
  if (method) {
    const methodName: Record<string, string> = {
      npm: `${SDK.browserPackage} via ${a.packageManager}`,
      script: 'Browser SDK via script loader',
      gtm: 'Google Tag Manager template',
      'unified-npm': `${SDK.unifiedPackage} via ${a.packageManager}`,
      'unified-script': 'script loader + Session Replay plugin',
    };
    headline = `${products} — ${methodName[method]}`;
  }

  if (!method) {
    steps.push({
      title: 'Tell me a bit more…',
      body: 'Answer the questions in the chat and your personalized install guide and config will appear here, ready to copy.',
    });
    return { headline, steps, decisions };
  }

  /* ---------- install steps ---------- */
  if (method === 'npm') {
    steps.push({
      title: 'Install the SDK',
      block: { lang: 'bash', title: 'terminal', code: pmInstall(a, SDK.browserPackage) },
    });
    steps.push({
      title: 'Initialize once, as early as possible',
      body: 'Put this where your app boots (main entry file). Replace YOUR_API_KEY with the API key from Amplitude → Settings → Projects.',
      block: { lang: 'js', title: 'app entry', code: browserInitJs(a) },
    });
  } else if (method === 'unified-npm') {
    steps.push({
      title: 'Install the Unified SDK',
      body: `One package that bundles ${products} — one init, shared identity and config.`,
      block: { lang: 'bash', title: 'terminal', code: pmInstall(a, SDK.unifiedPackage) },
    });
    steps.push({
      title: 'Initialize once, as early as possible',
      body: 'Replace YOUR_API_KEY with the API key from Amplitude → Settings → Projects.',
      block: { lang: 'js', title: 'app entry', code: unifiedInitJs(a) },
    });
  } else if (method === 'script') {
    const cfg = browserConfigSource(a);
    const opts = cfg.length ? `, {\n${cfg.join('\n')}\n}` : '';
    steps.push({
      title: 'Paste before </head> on every page',
      body: `This is the official async loader for v${SDK.browserVersion}: it queues calls made before the SDK arrives from the CDN, and the integrity hash pins the exact code. No build tools needed.`,
      block: {
        lang: 'html',
        title: 'index.html',
        code: `<script type="text/javascript">\n${BROWSER_SNIPPET_LOADER}\n\namplitude.init('YOUR_API_KEY'${opts});\n</script>`,
      },
    });
  } else if (method === 'unified-script') {
    const cfg = browserConfigSource(a, '    ');
    const opts = cfg.length ? `, {\n${cfg.join('\n')}\n  }` : '';
    const rate = a.srSampleRate ?? 0.1;
    const srLine = a.products.includes('sessionReplay')
      ? `  // ⚠️ Session Replay records nothing unless you set a sampleRate (default 0)\n  window.amplitude.add(window.sessionReplay.plugin({ sampleRate: ${rate} }));\n`
      : '';
    steps.push({
      title: 'Paste before </head> on every page',
      body: 'This key-based loader (the same one the Amplitude app generates) bundles Analytics and the Session Replay plugin — no build tools needed. Replace YOUR_API_KEY in both places.',
      block: {
        lang: 'html',
        title: 'index.html',
        code: `<script src="${SDK.keyScriptCdn}"></script>\n<script>\n${srLine}  window.amplitude.init('YOUR_API_KEY'${opts});\n</script>`,
      },
    });
    if (a.products.includes('experiment') || a.products.includes('guidesSurveys')) {
      steps.push({
        title: 'Heads up: Experiment / Guides & Surveys',
        body: 'The script loader covers Analytics + Session Replay. For Experiment or Guides & Surveys without a build step, use the Google Tag Manager template (Guides & Surveys) or ask your team about adding the Unified SDK via npm.',
      });
    }
  } else if (method === 'gtm') {
    steps.push({
      title: 'Add the Amplitude template in GTM',
      body: 'In Google Tag Manager: Tags → New → Tag Configuration → search the Community Template Gallery for “Amplitude Analytics” and add it. The template loads Amplitude’s GTM bundle from the CDN — your site code never changes.',
    });
    steps.push({
      title: 'Configure the tag',
      body: 'Create an initialization tag: paste YOUR_API_KEY, set the trigger to “Initialization – All Pages”. The template has UI fields for EU data residency, every autocapture toggle, Session Replay (on/off + sample rate) and Guides & Surveys — no code, and URL patterns are entered as text/regex fields.',
    });
    const cfg = browserConfigSource(a);
    if (cfg.length) {
      steps.push({
        title: 'Your answers → template settings',
        body: 'These are the settings your answers translate to — find the matching fields in the GTM template:',
        block: { lang: 'js', title: 'settings (for reference)', code: `{\n${cfg.join('\n')}\n}` },
      });
    }
  }

  steps.push({
    title: 'Verify',
    body: 'Load your site, then open Amplitude → your project → User Lookup (or the Ingestion Debugger). Events should arrive within seconds.',
  });

  /* ---------- decisions ---------- */
  if (method === 'unified-npm') {
    decisions.push({
      label: `Unified SDK (${SDK.unifiedPackage})`,
      why: `You picked ${products}: one bundled SDK gives correct plugin ordering and shared identity/config, instead of wiring ${a.products.length} packages together by hand.`,
    });
  }
  if (method === 'unified-script') {
    decisions.push({
      label: 'Key-based script loader',
      why: 'No build step needed, and this loader ships the Session Replay plugin alongside Analytics — one paste covers both.',
    });
  }
  if (method === 'npm' || method === 'unified-npm') {
    decisions.push({
      label: `Install via ${a.packageManager}`,
      why: 'You have a JS build pipeline — you get TypeScript types, tree-shaking, and versions pinned in your lockfile.',
    });
  }
  if (method === 'script') {
    decisions.push({
      label: 'Script loader',
      why: 'No build step needed. The async snippet stubs window.amplitude so early calls queue instead of getting lost, and the SRI hash pins the exact SDK code.',
    });
  }
  if (method === 'gtm') {
    decisions.push({
      label: 'Google Tag Manager',
      why: 'Your team manages tags in GTM — analytics changes ship via container publish, with no code deploys. Uses a separate window.amplitudeGTM global so it can coexist with a code install.',
    });
  }
  if (a.serverZone === 'EU') {
    decisions.push({
      label: "serverZone: 'EU'",
      why: 'Your org is on the EU data center (app.eu.amplitude.com); without this, events go to the US endpoint and never show up in your project.',
    });
  } else if (a.serverZone === 'US') {
    decisions.push({ label: "serverZone: 'US' (default)", why: 'US is the default — no config needed.' });
  }
  const toggles = a.autocapture === 'defaults' || !a.autocapture ? defaultToggles() : a.autocapture;
  for (const key of AUTOCAPTURE_KEYS) {
    const info = AUTOCAPTURE_INFO[key];
    if (toggles[key] !== info.defaultOn) {
      decisions.push({
        label: `autocapture.${key}: ${toggles[key]}`,
        why: `${info.short} Default is ${info.defaultOn ? 'on' : 'off'}; you turned it ${toggles[key] ? 'on' : 'off'}.`,
      });
    }
  }
  if (a.pageViewFilter) {
    decisions.push({
      label: 'Page view filter (trackOn)',
      why: `Only URLs matching ${regexLiteral(a.pageViewFilter)} count as page views — ${a.pageViewFilter.english}.`,
    });
  }
  for (const p of a.elementPageUrlAllowlist) {
    decisions.push({
      label: 'Click-tracking page allowlist',
      why: `Element interactions only on ${p.english}. Regex is used because plain strings must equal the FULL page URL exactly — they almost never match real pages.`,
    });
  }
  if (a.fetchRemoteConfig === false) {
    decisions.push({
      label: 'remoteConfig.fetchRemoteConfig: false',
      why: 'Autocapture settings changed in the Amplitude app will NOT apply at runtime — everything is pinned in code.',
    });
  } else if (a.fetchRemoteConfig === true) {
    decisions.push({
      label: 'Remote config on (the default)',
      why: 'Your team can tune autocapture from Amplitude → Settings → Autocapture without a code deploy; the SDK fetches it at startup.',
    });
  }
  // only methods that actually emit Session Replay config get this decision
  if (a.products.includes('sessionReplay') && (method === 'unified-npm' || method === 'unified-script')) {
    const rate = a.srSampleRate ?? 0.1;
    decisions.push({
      label: `sessionReplay.sampleRate: ${rate}`,
      why: `Records ${+(rate * 100).toFixed(
        2,
      )}% of sessions. The SDK default is 0 — forgetting this line is the #1 “why is nothing recording?” ticket.`,
    });
  }

  return { headline, steps, decisions };
}
