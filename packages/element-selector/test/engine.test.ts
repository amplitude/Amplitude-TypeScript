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
});
