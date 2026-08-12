import type { Answers, ChipOption, Widget } from '../types';
import { SDK } from '../kb/knowledge';

export interface FlowNode {
  id: string;
  bot: (a: Answers) => string[];
  widget?: (a: Answers) => Widget | undefined;
  chips?: (a: Answers) => ChipOption[];
  /** if set, jump straight to this node after showing messages */
  auto?: (a: Answers) => string | undefined;
}

const hasExtras = (a: Answers) => a.products.some((p) => p !== 'analytics');

/** Decide npm-vs-unified flavor of a method based on chosen products. */
const withFlavor = (a: Answers, kind: 'npm' | 'script'): Answers => ({
  ...a,
  installMethod: hasExtras(a) ? (kind === 'npm' ? 'unified-npm' : 'unified-script') : kind,
});

export const FLOW: Record<string, FlowNode> = {
  /* ---------------- entry ---------------- */
  welcome: {
    id: 'welcome',
    bot: () => [
      "👋 Hi! I'm the **Amplitude Setup Assistant**.\n\nCustomers often tell us they're not sure *which* SDK setup they need — there are a few ways to install the Browser SDK, lots of configuration options, and sometimes a regex gets involved. I'll figure out what fits you and generate copy-paste-ready code as we go (watch the panel on the right).",
      'What would you like to do?',
    ],
    chips: () => [
      { label: '🚀 Set me up from scratch', next: 'products' },
      { label: '🤔 Which installation method should I use?', next: 'products' },
      { label: '⚙️ Configure autocapture', next: 'ac-entry' },
      { label: '🧩 Help me write a URL regex', next: 'regex-standalone' },
      { label: '📡 What is remote config?', next: 'remote-info' },
    ],
  },

  /* ---------------- product selection ---------------- */
  products: {
    id: 'products',
    bot: () => [
      "First: what do you want Amplitude to do on your site? This decides *which* SDK you should install — that's the step most people get wrong.",
      'Pick everything you plan to use (you can start small and add later):',
    ],
    widget: () => ({ kind: 'productSelect' }),
  },

  'products-done': {
    id: 'products-done',
    bot: (a) =>
      hasExtras(a)
        ? [
            `Since you want more than analytics, I recommend a **bundled setup** — via npm that's the Unified SDK (\`${SDK.unifiedPackage}\`), and for no-build sites there's a script loader that ships Session Replay alongside Analytics. Either way: one integration instead of separate packages you'd have to keep in sync.`,
            'Next: how is your website built? This decides **how** you install it.',
          ]
        : [
            `Analytics only — the **Browser SDK** (\`${SDK.browserPackage}\`) is what you want.`,
            'Next: how is your website built? This decides **how** you install it.',
          ],
    chips: () => [
      {
        label: '📦 We use a bundler (webpack, Vite, Next.js…)',
        apply: (a) => withFlavor(a, 'npm'),
        next: 'zone',
      },
      {
        label: '📄 Plain HTML / CMS — I can paste a <script> tag',
        apply: (a) => withFlavor(a, 'script'),
        next: 'zone',
      },
      {
        label: '🏷️ We manage tags with Google Tag Manager',
        next: 'gtm-check',
      },
      { label: '🤷 Not sure — help me decide', next: 'env-help' },
    ],
  },

  'env-help': {
    id: 'env-help',
    bot: () => [
      'No problem — one question at a time.',
      'When your site gets updated, does a developer run commands like `npm install` or `npm run build`?',
    ],
    chips: () => [
      {
        label: 'Yes, we have a JS build process',
        apply: (a) => withFlavor(a, 'npm'),
        next: 'env-help-npm',
      },
      { label: 'No / it’s a CMS like WordPress', next: 'env-help-html' },
      { label: 'A marketing tool builds it for us', next: 'env-help-html' },
    ],
  },
  'env-help-npm': {
    id: 'env-help-npm',
    bot: () => [
      'Then installing via your package manager is the best fit: you get TypeScript types, versions pinned in your lockfile, and the SDK ships with your bundle. ✅',
    ],
    auto: () => 'zone',
  },
  'env-help-html': {
    id: 'env-help-html',
    bot: () => ['Can you edit the raw HTML of your pages (or a shared template/theme)?'],
    chips: () => [
      {
        label: 'Yes, I can add a <script> tag',
        apply: (a) => withFlavor(a, 'script'),
        next: 'env-help-script',
      },
      {
        label: 'No, but we have Google Tag Manager',
        next: 'gtm-check',
      },
    ],
  },
  'env-help-script': {
    id: 'env-help-script',
    bot: () => [
      'Then the **script loader** is your friend — paste one snippet before `</head>` and you’re live. No build tools involved. ✅',
    ],
    auto: () => 'zone',
  },

  'gtm-check': {
    id: 'gtm-check',
    bot: (a) =>
      a.products.includes('experiment')
        ? [
            'One heads-up: the official GTM template covers **Analytics, Session Replay and Guides & Surveys** — but **not Experiment**. For Experiment you’d want the Unified SDK in code.',
            'What works for you?',
          ]
        : [
            'Good news — Amplitude’s official GTM template has built-in switches for **autocapture, EU residency, Session Replay (with sample rate) and Guides & Surveys**. Your marketing team manages everything with container publishes, zero code deploys.',
          ],
    chips: (a) =>
      a.products.includes('experiment')
        ? [
            {
              label: 'Use the Unified SDK in code instead',
              apply: (x) => ({ ...x, installMethod: 'unified-npm' }),
              next: 'zone',
            },
            {
              label: 'Stick with GTM (drop Experiment for now)',
              apply: (x) => ({
                ...x,
                products: x.products.filter((p) => p !== 'experiment'),
                installMethod: 'gtm',
              }),
              next: 'zone',
            },
          ]
        : [
            {
              label: 'Sounds good, use GTM',
              apply: (x) => ({ ...x, installMethod: 'gtm' }),
              next: 'zone',
            },
            { label: 'Actually, let me reconsider', next: 'products-done' },
          ],
  },

  /* ---------------- data residency ---------------- */
  zone: {
    id: 'zone',
    bot: (a) => [
      ...(a.installMethod
        ? ['Install method locked in 🔒 — check the right panel, your guide is already forming.']
        : []),
      'Where does your Amplitude org live? If your company signed up for **EU data residency**, the SDK must point at the EU data center or your events will silently go to the wrong place.\n\nNot sure? Check the URL you use to log in: `app.amplitude.com` → US, `app.eu.amplitude.com` → EU.',
    ],
    chips: () => [
      { label: '🇺🇸 US (app.amplitude.com)', apply: (a) => ({ ...a, serverZone: 'US' }), next: 'zone-after' },
      { label: '🇪🇺 EU (app.eu.amplitude.com)', apply: (a) => ({ ...a, serverZone: 'EU' }), next: 'zone-after' },
    ],
  },

  'zone-after': {
    id: 'zone-after',
    bot: (a) => (a.installMethod ? [] : ['Zone saved ✅ — now let’s find the right SDK and install path for you.']),
    auto: (a) => (a.installMethod ? 'ac-intro' : 'products'),
  },

  /* ---------------- autocapture ---------------- */
  'ac-entry': {
    id: 'ac-entry',
    bot: () => [
      "Let's tune autocapture. Quick check — how did you install the SDK? (So the code I generate matches your setup.)",
    ],
    chips: () => [
      { label: '📦 npm / yarn / pnpm package', apply: (a) => withFlavor(a, 'npm'), next: 'ac-intro' },
      { label: '📄 Script tag on the page', apply: (a) => withFlavor(a, 'script'), next: 'ac-intro' },
      { label: '🏷️ Google Tag Manager', apply: (a) => ({ ...a, installMethod: 'gtm' }), next: 'ac-intro' },
      { label: "❓ Haven't installed yet", next: 'products' },
    ],
  },

  'ac-intro': {
    id: 'ac-intro',
    bot: () => [
      'Now the fun part: **autocapture**. The SDK can track a lot automatically — no tracking code sprinkled through your app.\n\nOn by default: page views, sessions, form interactions, file downloads, marketing attribution.\nOff by default: element clicks (Visual Labeling), web vitals, frustration signals.',
      'Want the defaults, or shall we tailor it?',
    ],
    chips: () => [
      {
        label: '✅ Recommended defaults are fine',
        apply: (a) => ({ ...a, autocapture: 'defaults' }),
        next: 'remote',
      },
      { label: '🎛️ Let me pick what gets tracked', next: 'ac-custom' },
      { label: 'What do these actually track?', next: 'ac-explain' },
    ],
  },

  'ac-explain': {
    id: 'ac-explain',
    bot: () => [
      'Here’s the cheat sheet:\n\n• **Page views** – “[Amplitude] Page Viewed” on every page load / SPA route change.\n• **Sessions** – start/end events, powers engagement metrics.\n• **Form interactions** – form started / submitted.\n• **File downloads** – clicks on pdf/zip/etc links.\n• **Attribution** – UTM params, referrer, ad click IDs, saved on the user.\n• **Element interactions** – every meaningful click, powering Visual Labeling: name events in the Amplitude UI *after the fact* instead of writing code. Off by default.\n• **Web vitals** – LCP/CLS/INP performance metrics. Off by default.\n• **Frustration signals** – rage clicks & dead clicks. Off by default.',
    ],
    auto: () => 'ac-intro',
  },

  'ac-custom': {
    id: 'ac-custom',
    bot: () => ['Toggle what you want — defaults are pre-selected:'],
    widget: () => ({ kind: 'autocaptureSelect' }),
  },

  'ac-custom-done': {
    id: 'ac-custom-done',
    bot: (a) => {
      const t = a.autocapture !== 'defaults' && a.autocapture ? a.autocapture : undefined;
      const msgs: string[] = ['Nice — config updated on the right. 👉'];
      if (t?.elementInteractions) {
        msgs.push(
          'You turned on **element interactions**. Tip: many teams limit click-tracking to the pages that matter to control noise (and event volume 💸).',
        );
      }
      return msgs;
    },
    auto: (a) => {
      const t = a.autocapture !== 'defaults' && a.autocapture ? a.autocapture : undefined;
      if (t?.elementInteractions) return undefined; // wait for chips
      if (t?.pageViews) return 'pv-filter';
      return 'remote';
    },
    chips: () => [
      {
        label: 'Track clicks everywhere',
        apply: (a) => ({ ...a, elementPageUrlAllowlist: [] }),
        next: 'pv-filter',
      },
      { label: '🧩 Only on certain pages (build the pattern with me)', next: 'el-regex' },
    ],
  },

  'el-regex': {
    id: 'el-regex',
    bot: () => [
      'This is exactly what `pageUrlAllowlist` is for. One trap worth knowing: if you put a plain **string** in the list, the SDK requires it to equal the *entire* page URL — protocol, query string and all — so strings almost never match real pages. That’s why this is regex territory.',
      "Good news: you won't have to write it. Answer in plain English, I'll write the regex, and we'll test it on your real URLs.",
    ],
    widget: () => ({ kind: 'regexBuilder', target: 'elementPageUrl' }),
  },

  'el-regex-done': {
    id: 'el-regex-done',
    bot: (a) =>
      a.installMethod
        ? ['Added to `elementInteractions.pageUrlAllowlist` ✅ — see the code panel.']
        : [
            'Pattern saved to `elementInteractions.pageUrlAllowlist` ✅ — it’ll appear in your generated code once we pick an install method.',
          ],
    chips: (a) => [
      { label: '➕ Add another pattern', next: 'el-regex' },
      a.installMethod
        ? { label: 'Continue ▶', next: 'pv-filter' }
        : { label: '🚀 Set up the SDK with this config', next: 'products' },
    ],
  },

  'pv-filter': {
    id: 'pv-filter',
    bot: (a) => {
      const t = a.autocapture !== 'defaults' && a.autocapture ? a.autocapture : undefined;
      if (t && !t.pageViews) return ['(Page views are off, skipping page-view filtering.)'];
      return [
        'About **page views**: track every page, or only specific URLs? (Marketing sites often track everything; apps sometimes only care about certain sections.)',
      ];
    },
    auto: (a) => {
      const t = a.autocapture !== 'defaults' && a.autocapture ? a.autocapture : undefined;
      return t && !t.pageViews ? 'remote' : undefined;
    },
    chips: () => [
      {
        label: 'Every page (recommended)',
        apply: (a) => ({ ...a, pageViewFilter: undefined }),
        next: 'remote',
      },
      { label: '🧩 Only certain URLs — build the filter with me', next: 'pv-regex' },
    ],
  },

  'pv-regex': {
    id: 'pv-regex',
    bot: () => ["Let's build the URL filter. Tell me in plain English which pages should count as a page view:"],
    widget: () => ({ kind: 'regexBuilder', target: 'pageViews' }),
  },

  'pv-regex-done': {
    id: 'pv-regex-done',
    bot: (a) =>
      a.installMethod
        ? ['Page view filter installed ✅ — the generated `trackOn` function is in the code panel.']
        : [
            'Pattern saved ✅ — it becomes a `trackOn` filter in your init code once we pick an install method. Want to do that now?',
          ],
    auto: (a) => (a.installMethod ? 'remote' : undefined),
    chips: () => [
      { label: '🚀 Yes, set up the SDK with this config', next: 'products' },
      { label: 'No thanks, I just needed the pattern', next: 'anything-else' },
    ],
  },

  /* ---------------- remote config ---------------- */
  remote: {
    id: 'remote',
    bot: () => [
      'One more thing: **remote config**. At startup the SDK fetches the settings you manage under *Amplitude → Settings → Autocapture* — so product/data teams can flip autocapture switches *without a code deploy*.\n\nIt has been **on by default** since SDK 2.13.0, and remote values win over code, field by field.',
    ],
    chips: () => [
      {
        label: '✅ Keep it on (recommended)',
        apply: (a) => ({ ...a, fetchRemoteConfig: true }),
        next: 'sr-sample',
      },
      {
        label: '🔒 Turn it off — code is the only source of truth',
        apply: (a) => ({ ...a, fetchRemoteConfig: false }),
        next: 'sr-sample',
      },
    ],
  },

  'remote-info': {
    id: 'remote-info',
    bot: () => [
      '**Remote config** lets the Browser SDK fetch part of its configuration from Amplitude servers at startup — the settings you toggle under *Amplitude → Settings → Autocapture* (autocapture switches, element-interaction allowlists, and more).\n\n• It is **on by default** since SDK 2.13.0 — no code needed.\n• Change settings in the app → they apply on the next page load, no deploy. Remote values win over code, field by field.\n• To pin everything in code instead: `init(KEY, { remoteConfig: { fetchRemoteConfig: false } })` (the old top-level `fetchRemoteConfig` flag still works but is deprecated).\n• Note: Session Replay sampling is fetched by its own client and is *not* affected by this flag.',
      'Want me to walk you through a full setup with it?',
    ],
    chips: () => [
      { label: '🚀 Yes, set me up from scratch', next: 'products' },
      { label: 'No thanks, that answered it', next: 'anything-else' },
    ],
  },

  /* ---------------- session replay sampling ---------------- */
  'sr-sample': {
    id: 'sr-sample',
    bot: (a) =>
      a.products.includes('sessionReplay') && a.installMethod !== 'gtm'
        ? [
            'Since you’re using **Session Replay**: what share of sessions should be recorded?\n\n⚠️ The SDK default is **0** — if you skip this, nothing records. That’s the single most common “Session Replay is broken” support ticket.',
          ]
        : [],
    auto: (a) => (a.products.includes('sessionReplay') && a.installMethod !== 'gtm' ? undefined : 'final'),
    chips: () => [
      { label: '100% — testing / low traffic', apply: (a) => ({ ...a, srSampleRate: 1 }), next: 'final' },
      { label: '10% — steady production', apply: (a) => ({ ...a, srSampleRate: 0.1 }), next: 'final' },
      { label: '1% — high traffic', apply: (a) => ({ ...a, srSampleRate: 0.01 }), next: 'final' },
    ],
  },

  'sampling-info': {
    id: 'sampling-info',
    bot: () => [
      '**Sampling** applies to Session Replay: `sessionReplay.sampleRate` controls what share of sessions get recorded (0.1 = 10%).\n\n⚠️ The SDK default is **0** — if you never set it, *nothing* records. That’s the single most common “Session Replay is broken” support ticket. You can also manage the sample rate remotely from the Amplitude app.',
      'Want me to set up Session Replay properly for you?',
    ],
    chips: () => [
      { label: '🚀 Yes, set me up with Session Replay', next: 'products' },
      { label: 'No thanks, that answered it', next: 'anything-else' },
    ],
  },

  /* ---------------- wrap up ---------------- */
  final: {
    id: 'final',
    bot: () => [
      "🎉 That's it! Your personalized setup is on the right:\n\n1. **Install** using the exact steps shown\n2. **Paste the init code** — swap in your real API key (Amplitude → Settings → Projects)\n3. **Verify** in User Lookup / Ingestion Debugger\n\nEvery choice you made is listed under *“Why these settings”* so you can share the reasoning with your team.",
      'Anything else?',
    ],
    chips: () => [
      { label: '🧩 Build another URL regex', next: 'regex-standalone' },
      { label: '🎛️ Revisit autocapture', next: 'ac-custom' },
      { label: '🔁 Start over', next: 'restart' },
    ],
  },

  'anything-else': {
    id: 'anything-else',
    bot: () => ['Anything else I can help with?'],
    chips: () => [
      { label: '🚀 Set me up from scratch', next: 'products' },
      { label: '🧩 Help me write a URL regex', next: 'regex-standalone' },
      { label: '⚙️ Configure autocapture', next: 'ac-entry' },
    ],
  },

  /* ---------------- standalone regex helper ---------------- */
  'regex-standalone': {
    id: 'regex-standalone',
    bot: () => [
      "Regex is the #1 “wait, what?” moment in SDK setup — let's skip the syntax entirely. What is the pattern for?",
    ],
    chips: () => [
      { label: 'Which pages count as a page view', next: 'pv-regex' },
      { label: 'Which pages track clicks (element interactions)', next: 'el-regex' },
      { label: 'Just help me write a URL pattern', next: 'generic-regex' },
    ],
  },

  'generic-regex': {
    id: 'generic-regex',
    bot: () => ['Describe what you want to match:'],
    widget: () => ({ kind: 'regexBuilder', target: 'generic' }),
  },

  'generic-regex-done': {
    id: 'generic-regex-done',
    bot: () => [
      'There’s your pattern ☝️ — copy it from the widget. You can use it anywhere the SDK accepts a `RegExp`.',
    ],
    auto: () => 'anything-else',
  },
};

/** Where widgets hand control back to the flow. */
export const WIDGET_DONE_NODE: Record<string, string> = {
  productSelect: 'products-done',
  autocaptureSelect: 'ac-custom-done',
  'regexBuilder:pageViews': 'pv-regex-done',
  'regexBuilder:elementPageUrl': 'el-regex-done',
  'regexBuilder:generic': 'generic-regex-done',
};

/* ---------------- free-text routing ---------------- */

interface Route {
  pattern: RegExp;
  reply: string;
  next?: string;
}

const ROUTES: Route[] = [
  {
    pattern: /regex|pattern|allowlist|allow list|url match/i,
    reply: 'Regex — my favorite topic to make disappear. 🪄',
    next: 'regex-standalone',
  },
  {
    pattern: /remote config|remote-config|fetchremoteconfig/i,
    reply: 'Good question — here’s the short version:',
    next: 'remote-info',
  },
  {
    pattern: /\b(eu|europe|gdpr|data residen|zone)\b/i,
    reply: 'Data residency matters — let’s get it right:',
    next: 'zone',
  },
  {
    pattern: /gtm|tag manager/i,
    reply: 'Google Tag Manager — let’s see if it’s the right fit:',
    next: 'gtm-check',
  },
  {
    pattern: /install|npm|yarn|pnpm|script|cdn|snippet|set ?up|start/i,
    reply: 'Let’s figure out the right installation for you:',
    next: 'products',
  },
  {
    pattern: /autocapture|auto capture|page ?view|click|element|form|download|vitals|frustration|rage/i,
    reply: 'Autocapture it is:',
    next: 'ac-entry',
  },
  {
    pattern: /session replay|replay|record/i,
    reply: 'Session Replay comes bundled in the Unified SDK — let’s plan your setup around it:',
    next: 'products',
  },
  {
    pattern: /sample|sampling/i,
    reply: 'Sampling — here you go:',
    next: 'sampling-info',
  },
];

export function routeFreeText(text: string): { reply: string; next: string } {
  for (const r of ROUTES) {
    if (r.pattern.test(text)) return { reply: r.reply, next: r.next ?? 'anything-else' };
  }
  return {
    reply:
      "I'm a guided assistant, so I stick to what I know deeply: installing and configuring the Amplitude Browser SDK. Pick a topic and I'll take it from there —",
    next: 'anything-else',
  };
}
