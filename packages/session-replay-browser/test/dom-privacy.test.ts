import { record } from '@amplitude/rrweb-record';
import { createPrivacyRecorderOptions } from '@amplitude/session-replay-dom-privacy';
describe('shared privacy recorder integration', () => {
  test('data attributes apply to snapshots and mutations without opting in', async () => {
    document.body.innerHTML = `
      <section data-amp-block><span>blocked_initial</span></section>
      <section data-amp-mask><span id="masked">masked_initial</span></section>
      <section class="amp-mask"><span data-amp-unmask>mask_wins</span></section>
      <input data-amp-mask placeholder="attribute_initial">
    `;
    const events: unknown[] = [];
    const stop = record({
      ...createPrivacyRecorderOptions({
        defaultMaskLevel: 'light',
        maskAttributes: ['placeholder'],
      }),
      recordAfter: 'DOMContentLoaded',
      emit: (event) => {
        events.push(event);
      },
    });
    try {
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await new Promise((resolve) => setTimeout(resolve, 0));
      const snapshot = JSON.stringify(events);
      expect(snapshot.includes('blocked_initial')).toBe(false);
      expect(snapshot.includes('masked_initial')).toBe(false);
      expect(snapshot.includes('attribute_initial')).toBe(false);
      expect(snapshot).not.toContain('mask_wins');
      events.length = 0;
      const masked = document.getElementById('masked');
      const input = document.querySelector('input');
      const blocked = document.querySelector('[data-amp-block] span');
      if (!masked || !input || !blocked) throw new Error('Missing fixture elements');
      masked.textContent = 'masked_updated';
      input.setAttribute('placeholder', 'attribute_updated');
      blocked.textContent = 'blocked_updated';
      await new Promise((resolve) => setTimeout(resolve, 0));
      const mutations = JSON.stringify(events);
      expect(mutations.includes('blocked_updated')).toBe(false);
      expect(mutations.includes('masked_updated')).toBe(false);
      expect(mutations.includes('attribute_updated')).toBe(false);
    } finally {
      stop?.();
      document.body.innerHTML = '';
    }
  });

  // Needs an @amplitude/rrweb-record that forwards maskAttributeFn to nodes added after the
  // first snapshot (SR-5751). The pinned release predates that fix, so this only runs against a
  // local rrweb build: `pnpm rrweb:link ../rrweb && RRWEB_LOCAL=true npx jest test/dom-privacy.test.ts`
  // (see CONTRIBUTING.md). Drop the gate once the rrweb pins include the fix.
  const describeWithLocalRrweb = process.env.RRWEB_LOCAL === 'true' ? describe : describe.skip;

  describeWithLocalRrweb('nodes added after the first snapshot', () => {
    test('maskAttributes applies to added elements and their descendants', async () => {
      document.body.innerHTML = '<main id="root"></main>';
      const events: unknown[] = [];
      const stop = record({
        ...createPrivacyRecorderOptions({
          defaultMaskLevel: 'conservative',
          maskAttributes: ['title', 'aria-label'],
        }),
        emit: (event) => {
          events.push(event);
        },
      });
      try {
        await new Promise((resolve) => setTimeout(resolve, 0));
        events.length = 0;
        const root = document.getElementById('root');
        if (!root) throw new Error('Missing fixture element');
        const row = document.createElement('div');
        row.setAttribute('title', 'Jane Member');
        row.setAttribute('data-keep', 'visible_attribute');
        const button = document.createElement('button');
        button.setAttribute('aria-label', 'John Member');
        row.appendChild(button);
        root.appendChild(row);
        await new Promise((resolve) => setTimeout(resolve, 0));
        const mutations = JSON.stringify(events);
        expect(mutations).toContain('visible_attribute');
        expect(mutations).not.toContain('Jane');
        expect(mutations).not.toContain('John');
      } finally {
        stop?.();
        document.body.innerHTML = '';
      }
    });
  });

  test('unmask attributes preserve text under conservative masking', async () => {
    document.body.innerHTML = '<span data-amp-unmask="false">visible_initial</span><span>hidden_initial</span>';
    const events: unknown[] = [];
    const stop = record({
      ...createPrivacyRecorderOptions({ defaultMaskLevel: 'conservative' }),
      emit: (event) => {
        events.push(event);
      },
    });
    try {
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(JSON.stringify(events)).toContain('visible_initial');
      expect(JSON.stringify(events)).not.toContain('hidden_initial');
      const element = document.querySelector('[data-amp-unmask]');
      if (!element) throw new Error('Missing fixture element');
      events.length = 0;
      element.textContent = 'visible_updated';
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(JSON.stringify(events)).toContain('visible_updated');
    } finally {
      stop?.();
      document.body.innerHTML = '';
    }
  });
});
