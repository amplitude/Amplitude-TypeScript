/**
 * Sensitive values that cross a length cutoff must be masked before truncation.
 * Truncating first can leave a fragment that no longer matches EMAIL_REGEX.
 */
import { BrowserClient, BrowserConfig, EnrichmentPlugin, ILogger, MASKED_TEXT_VALUE } from '@amplitude/analytics-core';
import { DataExtractor } from '../src/data-extractor';
import { autocapturePlugin } from '../src/autocapture-plugin';
import { DATA_AMP_MASK_ATTRIBUTES, MAX_ATTRIBUTE_LENGTH, MAX_TEXT_LENGTH } from '../src/constants';
import { createMockBrowserClient } from './mock-browser-client';
import { mockWindowLocationFromURL } from './utils';

const EMAIL = 'jane.doe@example.com';

type Case = { name: string; keep: number; masked: boolean };

// keep = email characters that fall before the cutoff. <= 0 means the email starts after it.
const CASES: Case[] = [
  { name: 'complete email entirely before cutoff', keep: 30, masked: true },
  { name: 'cutoff inside local part', keep: 6, masked: true },
  { name: 'cutoff immediately after @', keep: 9, masked: true },
  { name: 'cutoff inside domain label', keep: 14, masked: true },
  { name: 'cutoff immediately after domain dot', keep: 17, masked: true },
  { name: 'cutoff inside domain suffix', keep: 18, masked: true },
  { name: 'email entirely after cutoff', keep: -5, masked: false },
];

/** Whitespace-delimited text where the email starts at index (cutoff - keep). */
const buildText = (cutoff: number, keep: number) => {
  const start = cutoff - keep;
  return 'x'.repeat(start - 1) + ' ' + EMAIL + ' ' + 'y'.repeat(300);
};

/** URL with no whitespace where the email starts at index (cutoff - keep). */
const buildHref = (cutoff: number, keep: number) => {
  const head = 'https://example.com/p?a=';
  const tail = '&e=';
  const start = cutoff - keep;
  const href = head + 'a'.repeat(start - head.length - tail.length) + tail + EMAIL + '&z=' + 'z'.repeat(50);
  if (href.indexOf(EMAIL) !== start) {
    throw new Error(`email placed at ${href.indexOf(EMAIL)}, expected ${start}`);
  }
  return href;
};

const expectNoEmail = (value: string) => {
  expect(value).not.toContain('@');
  expect(value).not.toContain('jane');
  expect(value).not.toContain('example.com');
};

describe('mask sensitive strings before truncation', () => {
  let extractor: DataExtractor;

  beforeAll(() => {
    Object.defineProperty(window, 'location', {
      value: { hostname: '', href: '', pathname: '', search: '' },
      writable: true,
    });
  });

  beforeEach(() => {
    extractor = new DataExtractor({});
    mockWindowLocationFromURL(new URL('https://www.example.com/page'));
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('element text', () => {
    test("masks the customer's sample instead of keeping jane.doe@examp", () => {
      const button = document.createElement('button');
      button.textContent = 'x'.repeat(240) + ' jane.doe@example.com';
      document.body.appendChild(button);

      const text = extractor.getText(button);
      expect(text).toBe('x'.repeat(240) + ' ' + MASKED_TEXT_VALUE);
      expect(text.length).toBe(246);
      expect(extractor.getEventProperties('click', button, 'data-amp-track-')['[Amplitude] Element Text']).toBe(text);
    });

    test.each(CASES)('$name', ({ keep, masked }) => {
      const button = document.createElement('button');
      button.textContent = buildText(MAX_TEXT_LENGTH, keep);
      document.body.appendChild(button);

      const text = extractor.getEventProperties('click', button, 'data-amp-track-')[
        '[Amplitude] Element Text'
      ] as string;
      expectNoEmail(text);
      expect(text.includes(MASKED_TEXT_VALUE)).toBe(masked);
      expect(text.length).toBeLessThanOrEqual(MAX_TEXT_LENGTH);
    });

    test('still truncates non-sensitive text to MAX_TEXT_LENGTH', () => {
      const button = document.createElement('button');
      button.textContent = 'x'.repeat(MAX_TEXT_LENGTH + 400);
      document.body.appendChild(button);

      expect(extractor.getText(button)).toBe('x'.repeat(MAX_TEXT_LENGTH));
    });

    test('masks a credit card and an SSN that cross the cutoff', () => {
      const card = document.createElement('button');
      card.textContent = 'x'.repeat(244) + ' 4111 1111 1111 1111';
      const ssn = document.createElement('button');
      ssn.textContent = 'x'.repeat(249) + ' 123-45-6789';
      document.body.appendChild(card);
      document.body.appendChild(ssn);

      expect(extractor.getText(card)).toBe('x'.repeat(244) + ' ' + MASKED_TEXT_VALUE);
      expect(extractor.getText(ssn)).toBe('x'.repeat(249) + ' ' + MASKED_TEXT_VALUE);
    });
  });

  describe('attribute values', () => {
    test.each(CASES)('$name: aria-label, data-amp-track-*, title, and hierarchy', ({ keep, masked }) => {
      const value = buildText(MAX_ATTRIBUTE_LENGTH, keep);
      const button = document.createElement('button');
      button.textContent = 'ok';
      button.setAttribute('aria-label', value);
      button.setAttribute('data-amp-track-contact', value);
      button.setAttribute('title', value);
      document.body.appendChild(button);

      const props = extractor.getEventProperties('click', button, 'data-amp-track-');
      const trackAttr = (props['[Amplitude] Element Attributes'] as Record<string, string>).contact;
      const hierAttrs = (props['[Amplitude] Element Hierarchy'] as Array<{ attrs?: Record<string, string> }>)[0]
        .attrs as Record<string, string>;

      for (const captured of [
        props['[Amplitude] Element Aria Label'] as string,
        trackAttr,
        hierAttrs['aria-label'],
        hierAttrs.title,
        hierAttrs['data-amp-track-contact'],
      ]) {
        expectNoEmail(captured);
        expect(captured.includes(MASKED_TEXT_VALUE)).toBe(masked);
        expect(captured.length).toBeLessThanOrEqual(MAX_ATTRIBUTE_LENGTH);
      }
    });

    test('still truncates a non-sensitive attribute to MAX_ATTRIBUTE_LENGTH', () => {
      const button = document.createElement('button');
      button.textContent = 'ok';
      button.setAttribute('title', 't'.repeat(MAX_ATTRIBUTE_LENGTH + 400));
      document.body.appendChild(button);

      const props = extractor.getEventProperties('click', button, 'data-amp-track-');
      expect(props['[Amplitude] Element Hierarchy']).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            attrs: expect.objectContaining({ title: 't'.repeat(MAX_ATTRIBUTE_LENGTH) }),
          }),
        ]),
      );
    });
  });

  describe('element href', () => {
    test.each(CASES)('$name', ({ keep }) => {
      const href = buildHref(MAX_ATTRIBUTE_LENGTH, keep);
      const anchor = document.createElement('a');
      anchor.setAttribute('href', href);
      anchor.textContent = 'link';
      document.body.appendChild(anchor);
      expect(anchor.href).toBe(href);

      const props = extractor.getEventProperties('click', anchor, 'data-amp-track-');
      const hierHref = (props['[Amplitude] Element Hierarchy'] as Array<{ attrs?: Record<string, string> }>)[0].attrs
        ?.href;

      // The email pattern does not stop at the domain: [^\s@]+ runs to the next whitespace,
      // so the rest of this URL is part of the match and the captured value is only the mask.
      expect(props['[Amplitude] Element Href']).toBe(MASKED_TEXT_VALUE);
      expect(hierHref).toBe(MASKED_TEXT_VALUE);
    });

    test('does not scan an email that starts past the lookahead', () => {
      const href = 'https://example.com/' + 'a'.repeat(500) + EMAIL;
      const anchor = document.createElement('a');
      anchor.setAttribute('href', href);
      anchor.textContent = 'link';
      document.body.appendChild(anchor);

      const captured = extractor.getEventProperties('click', anchor, 'data-amp-track-')[
        '[Amplitude] Element Href'
      ] as string;
      expect(captured).toBe(href.substring(0, MAX_ATTRIBUTE_LENGTH));
      expect(captured).not.toContain(EMAIL);
      expect(captured).not.toContain('@');
    });
  });

  describe('assembled [Amplitude] Element Clicked event', () => {
    let plugin: EnrichmentPlugin | undefined;
    let track: jest.SpyInstance;

    beforeEach(async () => {
      jest.useFakeTimers();
      plugin = autocapturePlugin({ debounceTime: 4 });
      const instance = createMockBrowserClient();
      track = jest.spyOn(instance, 'track').mockImplementation(jest.fn());
      const loggerProvider = {
        log: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      } as unknown as ILogger;
      await plugin.setup?.(
        { defaultTracking: false, loggerProvider } as unknown as BrowserConfig,
        instance as BrowserClient,
      );
    });

    afterEach(async () => {
      await plugin?.teardown?.();
      document.body.innerHTML = '';
      jest.useRealTimers();
    });

    test('the tracked properties contain the mask token and no email fragment', () => {
      const heading = document.createElement('h2');
      heading.textContent = buildText(MAX_TEXT_LENGTH, 6);
      document.body.appendChild(heading);

      const anchor = document.createElement('a');
      anchor.id = 'target';
      const href = buildHref(MAX_ATTRIBUTE_LENGTH, 17);
      anchor.setAttribute('href', href);
      anchor.setAttribute('aria-label', buildText(MAX_ATTRIBUTE_LENGTH, 9));
      anchor.textContent = 'x'.repeat(240) + ' jane.doe@example.com';
      document.body.appendChild(anchor);

      anchor.dispatchEvent(new Event('click'));
      jest.advanceTimersByTime(10);

      expect(track).toHaveBeenCalledTimes(1);
      const [eventType, props] = track.mock.calls[0] as [string, Record<string, string>];
      expect(eventType).toBe('[Amplitude] Element Clicked');
      expect(props['[Amplitude] Element Text']).toBe('x'.repeat(240) + ' ' + MASKED_TEXT_VALUE);
      expectNoEmail(props['[Amplitude] Element Aria Label']);
      expect(props['[Amplitude] Element Aria Label']).toContain(MASKED_TEXT_VALUE);
      expect(props['[Amplitude] Element Href']).toBe(MASKED_TEXT_VALUE);
      expectNoEmail(props['[Amplitude] Element Parent Label']);
      expect(props['[Amplitude] Element Parent Label']).toContain(MASKED_TEXT_VALUE);
    });
  });

  test('data-amp-mask-attributes still replaces the named attribute before truncation', () => {
    const button = document.createElement('button');
    button.setAttribute(DATA_AMP_MASK_ATTRIBUTES, 'aria-label');
    button.setAttribute('aria-label', buildText(MAX_ATTRIBUTE_LENGTH, 14));
    button.textContent = 'ok';
    document.body.appendChild(button);

    const props = extractor.getEventProperties('click', button, 'data-amp-track-');
    expect(props['[Amplitude] Element Aria Label']).toBe(MASKED_TEXT_VALUE);
  });
});
