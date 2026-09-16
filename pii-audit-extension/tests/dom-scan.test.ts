// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { scanDocument } from '../src/content/dom-scan';

describe('scanDocument', () => {
  it('captures labeled field values with context', () => {
    document.body.innerHTML = `
      <section class="patient-header"><h2>Patient</h2>
        <label>Primary account holder</label><div data-v>M. Chen</div>
      </section>`;
    const items = scanDocument(document);
    const it0 = items.find((i) => i.value === 'M. Chen')!;
    expect(it0).toBeTruthy();
    expect(it0.context.nearestHeading).toBe('Patient');
    expect(it0.context.containerClass).toContain('patient-header');
    expect(it0.source).toBe('dom');
  });
});
