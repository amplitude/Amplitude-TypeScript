# Amplitude Setup Assistant (hackathon)

A guided chatbot website that solves three real customer pain points:

1. **“Which install do I use?”** — npm vs script loader vs Google Tag Manager vs the
   Unified SDK. The bot asks what products you want (Analytics / Session Replay /
   Experiment / Guides & Surveys) and how your site is built, then picks the right path.
2. **“What config do I want?”** — walks through autocapture toggles, EU data residency,
   remote config, and Session Replay sampling, and generates a **copy-paste-ready init
   snippet live** in the side panel — with a “Why these settings” explanation for every choice.
3. **“I can't write regex.”** — a plain-English regex builder for `pageUrlAllowlist` /
   page-view filters: pick an intent (“everything under /checkout”), type a path, get the
   regex plus a **live tester** where you paste your real URLs and see ✓/✗.

Voice-first: press 🎤 and speak instead of typing (answers are matched against the current
question's options), and toggle **voice replies** to have the bot read its answers aloud.

Every fact the bot states was extracted from this monorepo's source — autocapture defaults
from `packages/analytics-browser/src/default-tracking.ts`, URL-matching semantics from
`packages/analytics-core/src/utils/url-utils.ts` (full `location.href`, strings must match
exactly — the reason customers need regex), remote-config default from
`packages/analytics-browser/src/config.ts`, the real script-loader snippet from the
`analytics-browser` README, and the Unified SDK `initAll` shape from `packages/unified`.

## Run it

```bash
pnpm install
pnpm dev        # http://localhost:5199
pnpm build      # static build in dist/ — host on GitHub Pages
```

## Demo script (2 min)

1. Click **Set me up from scratch** → pick *Analytics + Session Replay* → “we use a bundler”
   → **EU** — watch the right panel switch to `@amplitude/unified` with `serverZone: 'EU'`.
2. **Let me pick what gets tracked** → turn on *Element interactions* → **Only on certain
   pages** → intent *Everything under a section* → type `/checkout` → paste a few real URLs
   into the tester → **Use this pattern** — the regex lands in `pageUrlAllowlist` with a comment.
3. Keep remote config on, pick 10% replay sampling → final snippet + “Why these settings”.
4. Press 🎤 and *say* “start over” — voice input + spoken replies.

## Architecture

- `src/engine/flow.ts` — the conversation as a typed decision graph (nodes → messages,
  option chips, widgets, auto-jumps) + keyword router for free text.
- `src/kb/` — the knowledge base: every SDK fact (defaults, versions, snippet) in one place.
- `src/generator/generate.ts` — answers → install steps + init code + rationale.
- `src/generator/regex.ts` — plain-English intents → regex, with escaping safe for `/…/` literals.
- `src/voice.ts` — Web Speech API: recognition, speech synthesis, fuzzy chip matching.
- No backend, no API keys — deterministic and demoable offline; `dist/` is fully static.

## Ideas for later

- LLM mode (Claude API) for free-form questions, with the flow engine as tool-calls.
- More flows: proxy setup, cookie options, identity/`identify` guidance, migration from v1.
- Feed real support-ticket taxonomy into the router.
- Host on GitHub Pages and embed in the docs site.
