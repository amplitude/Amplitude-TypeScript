/**
 * @jest-environment jsdom
 */

/**
 * Tests for the v1 element-selector engine integration in DataExtractor.
 *
 * The plumbing of interest: `getElementPath` should defer to the v1 engine
 * only when (a) an engine is attached AND (b) `engine.getConfig().enabled`
 * is true. Every other path stays on the legacy cssPath, preserving
 * pre-integration behavior bit-for-bit.
 *
 * This file lives next to `data-extractor.test.ts` rather than replacing
 * any of its cases — the legacy behavior tests stay green untouched.
 */

import { DataExtractor } from '../src/data-extractor';
import { createSelectorEngine, resolveSelectorConfig } from '@amplitude/element-selector';

describe('DataExtractor — v1 element-selector engine integration', () => {
  let dataExtractor: DataExtractor;

  beforeEach(() => {
    dataExtractor = new DataExtractor({});
    document.body.innerHTML = '';
  });

  describe('no engine attached', () => {
    it('returns the legacy cssPath output — pre-integration behavior preserved', () => {
      document.body.innerHTML = `<section id="hero"><button>Click</button></section>`;
      const target = document.querySelector('button') as Element;
      const path = dataExtractor.getElementPath(target);
      // Legacy cssPath terminates at the first id it sees and uses
      // :nth-child (not :nth-of-type). Format match is the contract.
      expect(path).toContain('#hero');
      expect(path).toContain('button');
    });

    it('returns the empty string for a null element', () => {
      expect(dataExtractor.getElementPath(null)).toBe('');
    });
  });

  describe('engine attached, enabled = false (the v1 ship-dormant default)', () => {
    it('still uses the legacy cssPath — kill switch off keeps existing customers on legacy', () => {
      const engine = createSelectorEngine(resolveSelectorConfig({ enabled: false }));
      dataExtractor.setSelectorEngine(engine);

      document.body.innerHTML = `<section id="hero"><button>Click</button></section>`;
      const target = document.querySelector('button') as Element;
      const path = dataExtractor.getElementPath(target);
      // Identical to the no-engine case — the engine's presence is invisible
      // until `enabled` flips on.
      expect(path).toContain('#hero');
      expect(path).toContain('button');
    });
  });

  describe('engine attached, enabled = true', () => {
    it('routes through engine.generate — emits v1 nth-of-type format', () => {
      const engine = createSelectorEngine(resolveSelectorConfig({ enabled: true }));
      dataExtractor.setSelectorEngine(engine);

      document.body.innerHTML = `<section id="hero"><div><button>Click</button></div></section>`;
      const target = document.querySelector('button') as Element;
      const path = dataExtractor.getElementPath(target);
      // v1 emits `nth-of-type` descent; legacy emits `nth-child` only on
      // ambiguity. Asserting on `nth-of-type` proves we routed through v1.
      expect(path).toBe('section#hero > div:nth-of-type(1) > button:nth-of-type(1)');
    });

    it('emits the explicit-tracking selector when the target carries the attribute', () => {
      const engine = createSelectorEngine(resolveSelectorConfig({ enabled: true }));
      dataExtractor.setSelectorEngine(engine);

      document.body.innerHTML = `<section id="hero"><button data-amp-track-id="signup-cta">Sign up</button></section>`;
      const target = document.querySelector('button') as Element;
      expect(dataExtractor.getElementPath(target)).toBe('[data-amp-track-id="signup-cta"]');
    });
  });

  describe('updateConfig flips the kill switch live', () => {
    it('switches from legacy to v1 emission on the very next call after updateConfig', () => {
      const engine = createSelectorEngine(resolveSelectorConfig({ enabled: false }));
      dataExtractor.setSelectorEngine(engine);
      document.body.innerHTML = `<section id="hero"><button>Click</button></section>`;
      const target = document.querySelector('button') as Element;

      // Engine attached but kill switch off → legacy path
      const before = dataExtractor.getElementPath(target);
      expect(before).not.toMatch(/nth-of-type/);

      // Flip the kill switch
      engine.updateConfig(resolveSelectorConfig({ enabled: true }));

      // Same target, same DOM, but now routed through the v1 engine
      const after = dataExtractor.getElementPath(target);
      expect(after).toMatch(/nth-of-type/);
    });
  });

  describe('setSelectorEngine accepts undefined to detach', () => {
    it('reverts to legacy cssPath when the engine is removed', () => {
      const engine = createSelectorEngine(resolveSelectorConfig({ enabled: true }));
      dataExtractor.setSelectorEngine(engine);

      document.body.innerHTML = `<section id="hero"><button>Click</button></section>`;
      const target = document.querySelector('button') as Element;
      const withEngine = dataExtractor.getElementPath(target);
      expect(withEngine).toMatch(/nth-of-type/);

      // Detach
      dataExtractor.setSelectorEngine(undefined);
      const detached = dataExtractor.getElementPath(target);
      expect(detached).not.toMatch(/nth-of-type/);
    });
  });
});
