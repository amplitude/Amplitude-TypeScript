# Element Selector Testbed

Interactive testbed and design reference for the v1 element-selector algorithm — the proposed replacement for autocapture's current `cssPath` logic.

## What's here

- **[`index.html`](./index.html)** — the interactive testbed. Click any element across the included scenarios and inspect the selector v1 generates, the strategy trace, the event-payload format, and a round-trip verification check. Includes a Rooms To Go-style Swiper scenario and a cross-session aggregation log. Self-contained — no build step.
- **[`design.md`](./design.md)** — the v1 design doc, covering motivation, algorithm shape, pattern packs, integration plan, multi-consumer architecture (SDK + dashboard + Chrome extension), and the rollout plan.

## Viewing

Once GitHub Pages is enabled for this branch, open the testbed at the Pages URL. The testbed file is `index.html`, so the folder URL serves it directly.

## Related

The selector logic itself will live in a new `@amplitude/element-selector` package (see `design.md` → Module layout). The autocapture plugin (`packages/plugin-autocapture-browser`) will depend on it, as will the app.amplitude.com tagging UI and the Chrome extension visual tagger.
