/**
 * @jest-environment jsdom
 */
import { generateSelector } from '../src/generate-selector';
import { createSelectorEngine } from '../src/engine';
import { resolveSelectorConfig, DEFAULT_RESOLVED_CONFIG } from '../src/config/resolve-config';
import { legacyCssPath } from '../src/legacy-css-path';
import { ResolvedSelectorConfig, SelectorEngine } from '../src/types';

function setBody(html: string): void {
  document.body.innerHTML = html;
}

function enabledConfig(overrides: Partial<ResolvedSelectorConfig> = {}): ResolvedSelectorConfig {
  return { ...resolveSelectorConfig({ enabled: true }), ...overrides };
}

describe('generateSelector', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('engine is null', () => {
    // The null branch is the whole reason this helper exists — pre-helper,
    // each consumer wrote its own `engine ?? cssPath(...)` branch. Lock the
    // behavior in here so any future refactor of the dashboard / extension
    // doesn't have to re-derive what "engine missing" should mean.
    it('routes to legacyCssPath when engine is null, regardless of enabled flag', () => {
      setBody(`<section><button data-amp-track-id="login-btn">x</button></section>`);
      const target = document.querySelector('button') as Element;

      // Even with enabled: true and a configured anchor present, no engine →
      // legacy walker. There's nothing else available to call.
      const result = generateSelector(target, null, enabledConfig());
      expect(result).toBe(legacyCssPath(target));
      expect(document.querySelector(result)).toBe(target);
    });

    it('returns empty string when the legacy walker cannot identify the node', () => {
      // Pass something that is not an Element to force the legacy walker's
      // defensive early-return path. generateSelector should propagate that
      // empty string without throwing.
      const notAnElement = document.createTextNode('x') as unknown as Element;

      expect(generateSelector(notAnElement, null, DEFAULT_RESOLVED_CONFIG)).toBe('');
    });
  });

  describe('engine is present', () => {
    // When the caller does have an engine, generateSelector just delegates.
    // The engine itself handles enabled / kill-switch / safety-net — keeping
    // that policy in one place is the entire point of moving it inside
    // engine.generate.
    it('delegates to engine.generate when an engine is provided', () => {
      setBody(`<button data-amp-track-id="login-btn">x</button>`);
      const target = document.querySelector('button') as Element;
      const engine = createSelectorEngine(enabledConfig());

      // No spy needed — the engine's own anchor strategy hits the
      // `data-amp-track-id` attribute, which legacyCssPath would NOT produce.
      // If generateSelector accidentally bypassed the engine, this assertion
      // would catch it.
      expect(generateSelector(target, engine, enabledConfig())).toBe('[data-amp-track-id="login-btn"]');
    });

    it('relies on the engine for kill-switch semantics (does not second-guess config.enabled)', () => {
      // We pass enabled: true to generateSelector but build the engine with
      // a disabled config. The engine should be the source of truth — its
      // kill switch should kick in, ignoring whatever config we hand to
      // generateSelector.
      setBody(`<button data-amp-track-id="login-btn">x</button>`);
      const target = document.querySelector('button') as Element;
      const engine = createSelectorEngine(resolveSelectorConfig()); // enabled: false

      const result = generateSelector(target, engine, enabledConfig());

      // Engine routed through legacy → no anchor in the output.
      expect(result).not.toContain('data-amp-track-id');
      expect(document.querySelector(result)).toBe(target);
    });

    it('passes the element through unchanged so engine.generate receives the original node', () => {
      // Mock engine that just records what it was called with.
      const recorded: Element[] = [];
      const engine: SelectorEngine = {
        generate(el) {
          recorded.push(el);
          return '[data-mock]';
        },
        getConfig: () => DEFAULT_RESOLVED_CONFIG,
        updateConfig: () => undefined,
        onConfigChange: () => () => undefined,
      };
      setBody(`<button id="t">x</button>`);
      const target = document.querySelector('#t') as Element;

      generateSelector(target, engine, enabledConfig());

      expect(recorded).toHaveLength(1);
      expect(recorded[0]).toBe(target);
    });
  });
});
