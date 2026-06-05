/**
 * Unstable-class pattern pack.
 *
 * The fallback walker filters classes through these regexes before adding them
 * to a selector. Classes that match are dropped — they don't participate in
 * sibling disambiguation and never appear in the emitted output. Defends
 * against three failure modes:
 *
 *   1. Build-tool / framework utilities (Tailwind, etc.) — class names that
 *      look stable but change with every design tweak.
 *   2. CSS-in-JS / build-hash classes (Emotion, CSS modules, styled-components,
 *      styled-jsx) — change on every build.
 *   3. Library runtime state classes (Swiper, MUI, Radix, Headless UI,
 *      BEM-style is-active/is-open) — class is stable in name but its presence
 *      on a given element moves as the user interacts.
 *
 * Defaults are surfaced to customers in remote config so they can audit what's
 * being filtered and add or remove patterns to match their stack.
 */

/**
 * Built-in defaults grouped by category for readability. The runtime treats
 * the whole list uniformly via `Array.prototype.some(pattern.test)`.
 */
export const DEFAULT_UNSTABLE_CLASS_PATTERNS: ReadonlyArray<RegExp> = [
  // ===== Tailwind / build-tool utilities =====

  // Tailwind spacing: p-4, px-2, py-8, pt-1, mt-4, etc.
  /^(p|m|px|py|mx|my|pt|pb|pl|pr|mt|mb|ml|mr)-\d+$/,
  // Tailwind sizing: w-full, h-screen, max-w-[1440px], etc.
  /^(w|h|min-w|max-w|min-h|max-h)-/,
  // Tailwind color / visual: bg-blue-500, text-white, border-gray-200, ring-2, etc.
  /^(text|bg|border|ring|fill|stroke)-/,
  // Tailwind state variants: hover:underline, focus:ring-2, active:bg-transparent.
  /^(hover|focus|active|disabled|group-hover):/,
  // Tailwind breakpoint variants: md:flex, lg:grid-cols-3.
  /^(sm|md|lg|xl|2xl):/,
  // Tailwind z-index utility: z-10, z-50.
  /^z-\d+$/,
  // Tailwind arbitrary data-attribute variants: data-[state=open]:bg-white.
  /^data-\[/,
  // Tailwind arbitrary selector variants: [&_.swiper-slide]:h-auto, [&>div]:p-4.
  /^\[/,

  // ===== CSS-in-JS / build hashes =====

  // Emotion: css-1abcd23, css-9xyzkw0.
  /^css-[a-z0-9]{6,}$/,
  // CSS modules: Button_root__abc123, Card_container__xyz789. The middle
  // segment can be as short as `root` (4 chars) in practice; the trailing
  // hash is the load-bearing part.
  /^[a-zA-Z]+_[a-zA-Z0-9]{3,}__[a-zA-Z0-9]{5,}$/,
  // styled-components: sc-bdVaJa, sc-1jjuPXC0.
  /^sc-[a-zA-Z0-9]{6,}$/,
  // styled-jsx (Next.js): jsx-1234567.
  /^jsx-\d+$/,

  // ===== Library runtime state classes =====

  // Swiper carousel slide states. Move between elements as carousel advances.
  /^swiper-slide-(visible|fully-visible|active|prev|next|duplicate)$/,
  // BEM-style interaction state: is-active, is-open, is-selected, etc.
  /^is-(active|open|selected|hovered|focused|expanded)$/,
  // MUI per-component state: MuiButton-focusVisible, MuiSwitch-checked, etc.
  /^Mui[A-Z][a-zA-Z]+-(focused|selected|disabled|expanded|focusVisible|active|checked)$/,
  // MUI bare state classes: Mui-selected, Mui-disabled.
  /^Mui-(selected|focused|disabled|expanded|focusVisible|active|checked)$/,
  // Radix-style state class mirrors: data-state-open, data-state-checked.
  /^data-state-/,
];

/**
 * Compile a list of regex pattern strings (e.g. from a remote-config payload)
 * into RegExp objects. Invalid patterns are skipped silently — proper logger
 * integration with @amplitude/analytics-core lands alongside
 * `resolveSelectorConfig` in the orchestration PR.
 *
 * Callers decide whether to merge the result with `DEFAULT_UNSTABLE_CLASS_PATTERNS`
 * or use it as a full replacement. That policy lives in the config resolver,
 * not here.
 */
export function compile(patterns: string[]): RegExp[] {
  const compiled: RegExp[] = [];
  for (const pattern of patterns) {
    try {
      compiled.push(new RegExp(pattern));
    } catch (_e) {
      // Invalid regex string — skip. Logger integration lands in the orchestration PR.
    }
  }
  return compiled;
}

/**
 * Filter a list of class names, dropping any that match a pattern. Returns a
 * new array containing only the survivors, preserving original order.
 *
 * Used by the fallback walker (in the next PR) before adding classes to a
 * selector for sibling disambiguation. Also returns sensibly on null /
 * undefined / empty inputs.
 */
export function filterClasses(classes: string[], patterns: ReadonlyArray<RegExp>): string[] {
  if (!classes || classes.length === 0) return [];
  const survivors: string[] = [];
  for (const cls of classes) {
    if (!cls) continue;
    let matched = false;
    for (const pattern of patterns) {
      if (pattern.test(cls)) {
        matched = true;
        break;
      }
    }
    if (!matched) survivors.push(cls);
  }
  return survivors;
}
