/**
 * @jest-environment jsdom
 */
import { createSelectorEngine } from '../src/engine';
import { resolveSelectorConfig } from '../src/config/resolve-config';
import { ResolvedSelectorConfig, Strategy } from '../src/types';

function setBody(html: string): void {
  document.body.innerHTML = html;
}

function enabledConfig(overrides: Partial<ResolvedSelectorConfig> = {}): ResolvedSelectorConfig {
  return { ...resolveSelectorConfig({ enabled: true }), ...overrides };
}

describe('createSelectorEngine', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('generate — happy path through each layer', () => {
    it('returns the explicit-tracking selector via the orchestrator', () => {
      setBody(`<button data-amp-track-id="login-btn">x</button>`);
      const engine = createSelectorEngine(enabledConfig());
      const target = document.querySelector('button') as Element;
      expect(engine.generate(target)).toBe('[data-amp-track-id="login-btn"]');
    });

    it('returns the stableId selector via the orchestrator when no explicit anchor exists', () => {
      setBody(`<section id="hero"><button>x</button></section>`);
      const engine = createSelectorEngine(enabledConfig());
      const target = document.querySelector('button') as Element;
      expect(engine.generate(target)).toBe('section#hero > button:nth-of-type(1)');
    });

    it('falls back to fallbackCssPath when the orchestrator returns null', () => {
      // No ids, no explicit anchors → orchestrator chain returns null → engine
      // invokes fallback → fallback walks to <html>.
      setBody(`<div><button>x</button></div>`);
      const engine = createSelectorEngine(enabledConfig());
      const target = document.querySelector('button') as Element;
      const result = engine.generate(target);
      expect(result).toBe('html > body:nth-of-type(1) > div:nth-of-type(1) > button:nth-of-type(1)');
    });

    it('does not return an ambiguous fallback selector when duplicate ids exist', () => {
      setBody(`
        <section>
          <div id="dupe"><button>a</button></div>
          <div id="dupe"><button>b</button></div>
        </section>
      `);
      const engine = createSelectorEngine(enabledConfig());
      const target = document.querySelectorAll('button')[1] as Element;
      const result = engine.generate(target);

      expect(result).not.toContain('#dupe');
      expect(document.querySelector(result)).toBe(target);
    });
  });

  describe('getConfig', () => {
    it('returns the current resolved config', () => {
      const initial = enabledConfig();
      const engine = createSelectorEngine(initial);
      expect(engine.getConfig()).toBe(initial);
    });
  });

  describe('updateConfig + onConfigChange', () => {
    it('replaces the active config and notifies all subscribers', () => {
      const engine = createSelectorEngine(enabledConfig());
      const cb1 = jest.fn();
      const cb2 = jest.fn();
      engine.onConfigChange(cb1);
      engine.onConfigChange(cb2);

      const next = enabledConfig({ explicitTrackingAttribute: 'data-other' });
      engine.updateConfig(next);

      expect(cb1).toHaveBeenCalledWith(next);
      expect(cb2).toHaveBeenCalledWith(next);
      expect(engine.getConfig()).toBe(next);
    });

    it('the new config takes effect on the very next generate() call', () => {
      const engine = createSelectorEngine(enabledConfig());
      setBody(`<button data-track-it="x">x</button>`);
      const target = document.querySelector('button') as Element;

      // Before update — `data-track-it` is not the configured attribute → no anchor.
      // Falls back to fallback walker rooted at <html>.
      const before = engine.generate(target);
      expect(before).toMatch(/html > body/);

      engine.updateConfig(enabledConfig({ explicitTrackingAttribute: 'data-track-it' }));

      const after = engine.generate(target);
      expect(after).toBe('[data-track-it="x"]');
    });

    it('the unsubscribe function detaches the subscriber', () => {
      const engine = createSelectorEngine(enabledConfig());
      const cb = jest.fn();
      const unsubscribe = engine.onConfigChange(cb);

      engine.updateConfig(enabledConfig({ explicitTrackingAttribute: 'data-a' }));
      expect(cb).toHaveBeenCalledTimes(1);

      unsubscribe();
      engine.updateConfig(enabledConfig({ explicitTrackingAttribute: 'data-b' }));
      expect(cb).toHaveBeenCalledTimes(1); // not called again
    });

    it('isolates subscriber exceptions so one bad listener cannot break others', () => {
      const engine = createSelectorEngine(enabledConfig());
      const ok = jest.fn();
      const bad = jest.fn(() => {
        throw new Error('listener exploded');
      });
      engine.onConfigChange(bad);
      engine.onConfigChange(ok);

      // Should NOT throw.
      expect(() => engine.updateConfig(enabledConfig())).not.toThrow();
      expect(ok).toHaveBeenCalledTimes(1);
    });

    it('forwards subscriber exceptions to the provided logger at warn level', () => {
      const logger = {
        log: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        disable: jest.fn(),
        enable: jest.fn(),
      };
      const engine = createSelectorEngine(enabledConfig(), { logger });
      engine.onConfigChange(() => {
        throw new Error('listener exploded');
      });

      engine.updateConfig(enabledConfig());

      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('listener exploded'));
    });
  });

  describe('isolation across instances', () => {
    it('two engines have independent config state and subscriber lists', () => {
      const engineA = createSelectorEngine(enabledConfig({ explicitTrackingAttribute: 'data-a' }));
      const engineB = createSelectorEngine(enabledConfig({ explicitTrackingAttribute: 'data-b' }));

      const cbA = jest.fn();
      engineA.onConfigChange(cbA);

      engineB.updateConfig(enabledConfig({ explicitTrackingAttribute: 'data-b-2' }));
      expect(cbA).not.toHaveBeenCalled();
      expect(engineA.getConfig().explicitTrackingAttribute).toBe('data-a');
    });
  });

  describe('custom strategy chain via factory options', () => {
    it('uses the provided strategies instead of the defaults', () => {
      const sentinel: Strategy = {
        name: 'sentinel',
        try() {
          return '[data-sentinel="hit"]';
        },
      };
      setBody(`<button data-sentinel="hit">x</button>`);
      const engine = createSelectorEngine(enabledConfig(), { strategies: [sentinel] });
      const target = document.querySelector('button') as Element;
      expect(engine.generate(target)).toBe('[data-sentinel="hit"]');
    });
  });

  describe('kill switch (config.enabled === false)', () => {
    // The default resolved config has `enabled: false`. Customers who haven't
    // opted into the engine — every org pre-rollout — must emit the same
    // selectors they were emitting before the engine existed. The strategy
    // chain MUST NOT run for these calls, even if a customer's config happens
    // to include patterns or anchors that would otherwise match.
    it('routes engine.generate through legacyCssPath when enabled is false', () => {
      setBody(`<section><button data-amp-track-id="login-btn">x</button></section>`);
      // Note: config.enabled is false (default) but the document still has
      // a `data-amp-track-id` anchor. The kill switch must ignore the anchor.
      const engine = createSelectorEngine(resolveSelectorConfig());
      const target = document.querySelector('button') as Element;
      const result = engine.generate(target);

      // Legacy walker output, not the strategy-chain anchor.
      expect(result).not.toContain('data-amp-track-id');
      // Selector still resolves back to the same element (the legacy walker
      // produces a positional path; that's the byte-for-byte contract with
      // pre-engine autocapture).
      expect(document.querySelector(result)).toBe(target);
    });

    it('does not invoke custom strategies when enabled is false', () => {
      // The kill switch must skip the strategy chain entirely — running a
      // custom strategy here would prove the chain executed, which would
      // break parity with pre-engine autocapture for opted-out customers.
      const tryFn = jest.fn().mockReturnValue('[data-should-not-be-used="x"]');
      const sentinel: Strategy = { name: 'sentinel', try: tryFn };
      setBody(`<button>x</button>`);

      const engine = createSelectorEngine(resolveSelectorConfig(), { strategies: [sentinel] });
      const target = document.querySelector('button') as Element;
      engine.generate(target);

      expect(tryFn).not.toHaveBeenCalled();
    });

    it('updateConfig from disabled to enabled flips routing on the next call', () => {
      setBody(`<button data-amp-track-id="login-btn">x</button>`);
      const engine = createSelectorEngine(resolveSelectorConfig());
      const target = document.querySelector('button') as Element;

      // Disabled → legacy.
      expect(engine.generate(target)).not.toContain('data-amp-track-id');

      // Enable.
      engine.updateConfig(enabledConfig());

      // Enabled → strategy chain anchor.
      expect(engine.generate(target)).toBe('[data-amp-track-id="login-btn"]');
    });
  });

  describe('strategy-chain safety net', () => {
    // The strategy chain or its fallback walker should never propagate a
    // runtime exception up into the autocapture click handler — that path
    // owns the customer's analytics events and an unhandled throw means the
    // event is silently dropped. The engine's job here is to swallow the
    // throw, warn (if a logger is attached), and emit a legacy selector so
    // the event still ships with *some* identifier.
    it('catches strategy-chain throws and falls back to legacyCssPath', () => {
      const exploder: Strategy = {
        name: 'exploder',
        try() {
          throw new Error('strategy registry exploded');
        },
      };
      setBody(`<section><button class="cta">x</button></section>`);

      const engine = createSelectorEngine(enabledConfig(), { strategies: [exploder] });
      const target = document.querySelector('button') as Element;

      // Should NOT throw.
      expect(() => engine.generate(target)).not.toThrow();
      const result = engine.generate(target);

      // Legacy walker produces a non-empty selector that resolves back to the
      // same element. The exact string is brittle to refactors of the walker;
      // assert the round-trip invariant instead.
      expect(result.length).toBeGreaterThan(0);
      expect(document.querySelector(result)).toBe(target);
    });

    it('forwards strategy-chain throws to the logger at warn level', () => {
      const exploder: Strategy = {
        name: 'exploder',
        try() {
          throw new Error('strategy registry exploded');
        },
      };
      const logger = {
        log: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        disable: jest.fn(),
        enable: jest.fn(),
      };
      setBody(`<button>x</button>`);

      const engine = createSelectorEngine(enabledConfig(), { strategies: [exploder], logger });
      const target = document.querySelector('button') as Element;
      engine.generate(target);

      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('strategy registry exploded'));
    });
  });
});
