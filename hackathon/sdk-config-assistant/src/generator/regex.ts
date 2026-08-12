import type { RegexPattern } from '../types';

export type RegexIntent = 'exactPage' | 'underSection' | 'contains' | 'oneOf' | 'domainOnly' | 'except';

export interface IntentInfo {
  id: RegexIntent;
  label: string;
  hint: string;
  placeholder: string;
  multi?: boolean;
}

export const REGEX_INTENTS: IntentInfo[] = [
  {
    id: 'exactPage',
    label: 'One exact page',
    hint: 'e.g. only the pricing page',
    placeholder: '/pricing',
  },
  {
    id: 'underSection',
    label: 'Everything under a section',
    hint: 'e.g. /checkout and everything below it',
    placeholder: '/checkout',
  },
  {
    id: 'oneOf',
    label: 'A few specific pages',
    hint: 'a short list of pages',
    placeholder: '/pricing, /about, /contact',
    multi: true,
  },
  {
    id: 'contains',
    label: 'URL contains a word',
    hint: 'match anywhere in the URL',
    placeholder: 'checkout',
  },
  {
    id: 'domainOnly',
    label: 'Only a specific (sub)domain',
    hint: 'e.g. only app.example.com',
    placeholder: 'app.example.com',
  },
  {
    id: 'except',
    label: 'Everything except…',
    hint: 'exclude some sections',
    placeholder: '/admin, /internal',
    multi: true,
  },
];

// also escapes '/' so the pattern stays valid when emitted as a /…/ literal
export const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/** Normalize user input to a path. Accepts bare paths, full URLs, and
 *  scheme-less URLs like "example.com/pricing". Keeps SPA hash routes. */
const cleanPath = (raw: string): string => {
  let p = raw.trim();
  if (!p) return '';
  try {
    let urlStr: string | null = null;
    if (/^https?:\/\//i.test(p)) urlStr = p;
    // scheme-less host+path paste, e.g. "example.com/pricing"
    else if (/^[\w-]+(\.[\w-]+)+(:\d+)?\//.test(p)) urlStr = 'https://' + p;
    if (urlStr) {
      const u = new URL(urlStr);
      // keep SPA hash routes (#/dashboard) as part of the matchable path
      p = u.hash.startsWith('#/') ? u.pathname.replace(/\/$/, '') + u.hash : u.pathname;
    }
  } catch {
    /* keep as-is */
  }
  if (!p.startsWith('/')) p = '/' + p;
  // drop trailing slash (pattern re-adds optional one)
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p;
};

const splitList = (raw: string): string[] =>
  raw
    .split(/[,\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * Build a regex from a plain-english intent.
 *
 * Patterns are written to be tested against the FULL page URL
 * (window.location.href), which is what the SDK matches allowlists against.
 * Boundary groups accept '/', '?', '#' or end-of-string so query strings and
 * hash fragments can't sneak past a filter.
 */
export function buildRegex(intent: RegexIntent, input: string): RegexPattern | null {
  const ANY_ORIGIN = 'https?:\\/\\/[^/]+';
  const TAIL = '\\/?([?#].*)?$'; // optional trailing slash, then optional query/hash
  const BOUNDARY = '(\\/|\\?|#|$)';

  switch (intent) {
    case 'exactPage': {
      const path = cleanPath(input);
      if (!path) return null;
      return {
        source: `^${ANY_ORIGIN}${escapeRegex(path)}${TAIL}`,
        flags: '',
        english: `exactly the page ${path} (any domain, trailing slash and query/hash allowed)`,
      };
    }
    case 'underSection': {
      const path = cleanPath(input);
      if (!path) return null;
      return {
        source: `^${ANY_ORIGIN}${escapeRegex(path)}${BOUNDARY}`,
        flags: '',
        english: `${path} and every page under it (e.g. ${path}/step-1)`,
      };
    }
    case 'oneOf': {
      const paths = splitList(input).map(cleanPath).filter(Boolean);
      if (paths.length === 0) return null;
      const body = paths.map((p) => escapeRegex(p.slice(1))).join('|');
      return {
        source: `^${ANY_ORIGIN}\\/(${body})${TAIL}`,
        flags: '',
        english: `any of these pages: ${paths.join(', ')}`,
      };
    }
    case 'contains': {
      const word = input.trim();
      if (!word) return null;
      return {
        source: escapeRegex(word),
        flags: 'i',
        english: `any URL containing “${word}” (case-insensitive)`,
      };
    }
    case 'domainOnly': {
      // hosts are always lowercase in location.href
      const host = input
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/\/.*$/, '');
      if (!host) return null;
      const port = host.includes(':') ? '' : '(:\\d+)?';
      return {
        source: `^https?:\\/\\/${escapeRegex(host)}${port}\\/`,
        flags: '',
        english: `any page on ${host} (and only that host)`,
      };
    }
    case 'except': {
      const paths = splitList(input).map(cleanPath).filter(Boolean);
      if (paths.length === 0) return null;
      const body = paths.map((p) => escapeRegex(p.slice(1))).join('|');
      return {
        source: `^${ANY_ORIGIN}\\/(?!(${body})${BOUNDARY})`,
        flags: '',
        english: `every page except ${paths.join(', ')} (and pages under them)`,
      };
    }
  }
}

/** Suggest example URLs to seed the live tester with. */
export function exampleUrls(intent: RegexIntent, input: string): string[] {
  const first = splitList(input)[0] ?? '';
  const path = cleanPath(first) || '/pricing';
  const urls: string[] = [];
  // if they pasted a real URL, test it verbatim first
  const raw = first.trim();
  if (/^https?:\/\//i.test(raw)) urls.push(raw);
  else if (/^[\w-]+(\.[\w-]+)+(:\d+)?\//.test(raw)) urls.push('https://' + raw);

  switch (intent) {
    case 'domainOnly': {
      const host =
        input
          .trim()
          .toLowerCase()
          .replace(/^https?:\/\//, '')
          .replace(/\/.*$/, '') || 'app.example.com';
      urls.push(`https://${host}/home`, 'https://www.example.com/home');
      break;
    }
    case 'contains': {
      const w = input.trim() || 'checkout';
      urls.push(`https://example.com/${w}/step-1`, 'https://example.com/other-page');
      break;
    }
    default:
      urls.push(
        `https://example.com${path}`,
        `https://example.com${path}/nested`,
        `https://example.com${path}?utm_source=email`,
        `https://example.com${path}#section`,
        'https://example.com/some-other-page',
      );
  }
  return [...new Set(urls)];
}

export function testPattern(p: RegexPattern, url: string): boolean | null {
  try {
    return new RegExp(p.source, p.flags).test(url.trim());
  } catch {
    return null;
  }
}

/** Render as a JS regex literal for generated code. */
export const regexLiteral = (p: RegexPattern): string => `/${p.source}/${p.flags}`;
