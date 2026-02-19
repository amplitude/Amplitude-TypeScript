/**
 * @jest-environment jsdom
 */

import { asyncLoadScript, generateUniqueId } from '../../src/messenger/utils';

beforeAll(() => {
  if (!globalThis.CSS?.escape) {
    // jsdom does not implement CSS.escape; provide a minimal polyfill
    globalThis.CSS = { escape: (v: string) => v.replace(/([^\w-])/g, '\\$1') } as typeof CSS;
  }
});

describe('asyncLoadScript', () => {
  afterEach(() => {
    document.head.querySelectorAll('script').forEach((s) => s.remove());
  });

  test('should append a script element and resolve on load', async () => {
    const promise = asyncLoadScript('https://cdn.example.com/test.js');

    const script = document.querySelector('script[src="https://cdn.example.com/test.js"]') as HTMLScriptElement;
    expect(script).not.toBeNull();
    expect(script.async).toBe(true);
    expect(script.type).toBe('text/javascript');

    script.dispatchEvent(new Event('load'));

    await expect(promise).resolves.toEqual({ status: true });
  });

  test('should reject when the script fails to load', async () => {
    const promise = asyncLoadScript('https://cdn.example.com/bad.js');

    const script = document.querySelector('script[src="https://cdn.example.com/bad.js"]') as HTMLScriptElement;
    script.dispatchEvent(new Event('error'));

    await expect(promise).rejects.toEqual({
      status: false,
      message: 'Failed to load the script https://cdn.example.com/bad.js',
    });
  });

  test('should resolve immediately if a script with the same src already exists', async () => {
    const existing = document.createElement('script');
    existing.src = 'https://cdn.example.com/dup.js';
    document.head.appendChild(existing);

    const result = await asyncLoadScript('https://cdn.example.com/dup.js');

    expect(result).toEqual({ status: true });

    const scripts = document.querySelectorAll('script[src="https://cdn.example.com/dup.js"]');
    expect(scripts).toHaveLength(1);
  });

  test('should handle URLs with special CSS characters', async () => {
    const url = 'https://cdn.example.com/script.js?v=1&t=2';
    const promise = asyncLoadScript(url);

    const script = document.querySelector(`script[src="${CSS.escape(url)}"]`) as HTMLScriptElement;
    expect(script).not.toBeNull();

    script.dispatchEvent(new Event('load'));

    await expect(promise).resolves.toEqual({ status: true });
  });
});

describe('generateUniqueId', () => {
  test('should return a string', () => {
    expect(typeof generateUniqueId()).toBe('string');
  });

  test('should contain a timestamp and random portion separated by a hyphen', () => {
    const id = generateUniqueId();
    const parts = id.split('-');

    expect(parts.length).toBe(2);
    expect(Number(parts[0])).not.toBeNaN();
    expect(parts[1].length).toBeGreaterThan(0);
  });

  test('should produce unique values across calls', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateUniqueId()));
    expect(ids.size).toBe(100);
  });
});
