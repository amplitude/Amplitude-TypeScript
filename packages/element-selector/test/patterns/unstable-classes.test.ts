import { DEFAULT_UNSTABLE_CLASS_PATTERNS, compile, filterClasses } from '../../src/patterns/unstable-classes';

describe('DEFAULT_UNSTABLE_CLASS_PATTERNS', () => {
  const matchCases: Array<{ cls: string; reason: string }> = [
    // Tailwind spacing
    { cls: 'p-4', reason: 'Tailwind padding utility' },
    { cls: 'px-12', reason: 'Tailwind horizontal padding utility' },
    { cls: 'mt-8', reason: 'Tailwind top margin utility' },
    // Tailwind sizing
    { cls: 'w-full', reason: 'Tailwind width utility' },
    { cls: 'h-screen', reason: 'Tailwind height utility' },
    { cls: 'max-w-[1440px]', reason: 'Tailwind arbitrary max-width' },
    // Tailwind color / visual
    { cls: 'bg-blue-500', reason: 'Tailwind background color' },
    { cls: 'text-white', reason: 'Tailwind text color' },
    { cls: 'border-gray-200', reason: 'Tailwind border color' },
    // Tailwind variants
    { cls: 'hover:underline', reason: 'Tailwind hover variant' },
    { cls: 'focus:ring-2', reason: 'Tailwind focus variant' },
    { cls: 'active:bg-transparent', reason: 'Tailwind active variant' },
    { cls: 'md:flex', reason: 'Tailwind breakpoint variant' },
    { cls: '2xl:hidden', reason: 'Tailwind 2xl breakpoint variant' },
    // Other Tailwind utilities
    { cls: 'z-10', reason: 'Tailwind z-index' },
    { cls: 'data-[state=open]:bg-white', reason: 'Tailwind arbitrary data variant' },
    { cls: '[&_.swiper-slide]:h-auto', reason: 'Tailwind arbitrary selector variant' },
    // CSS-in-JS / build hashes
    { cls: 'css-1abcd23', reason: 'Emotion-generated class' },
    { cls: 'Button_root__abc123', reason: 'CSS modules class' },
    { cls: 'sc-bdVaJa', reason: 'styled-components class' },
    { cls: 'jsx-1234567', reason: 'styled-jsx class' },
    // Library runtime state
    { cls: 'swiper-slide-active', reason: 'Swiper active slide state' },
    { cls: 'swiper-slide-next', reason: 'Swiper next slide state' },
    { cls: 'is-active', reason: 'BEM-style active state' },
    { cls: 'is-open', reason: 'BEM-style open state' },
    { cls: 'MuiButton-focusVisible', reason: 'MUI per-component focus state' },
    { cls: 'Mui-selected', reason: 'MUI bare selected state' },
    { cls: 'data-state-open', reason: 'Radix-style state class mirror' },
  ];

  const nonMatchCases: Array<{ cls: string; reason: string }> = [
    { cls: 'signup-cta', reason: 'Plain semantic class' },
    { cls: 'product-card', reason: 'Plain compound class' },
    { cls: 'btn-primary', reason: 'Plain hyphenated class' },
    { cls: 'nav', reason: 'Single-word class' },
    { cls: 'header', reason: 'Single-word class' },
    { cls: 'MuiButton-root', reason: 'MUI structural class — not a state suffix' },
    { cls: 'swiper-slide', reason: 'Bare swiper-slide — only the state-suffixed variants are filtered' },
    { cls: 'is-cool', reason: 'is- prefix but not in the state-class allowlist' },
    { cls: 'data-state-foo', reason: 'data-state-* IS filtered, even unfamiliar suffixes (broad family match)' },
  ];

  matchCases.forEach(({ cls, reason }) => {
    it(`flags "${cls}" as unstable (${reason})`, () => {
      const matched = DEFAULT_UNSTABLE_CLASS_PATTERNS.some((p) => p.test(cls));
      expect(matched).toBe(true);
    });
  });

  nonMatchCases
    .filter((c) => c.cls !== 'data-state-foo') // separately asserted below
    .forEach(({ cls, reason }) => {
      it(`does not flag "${cls}" (${reason})`, () => {
        const matched = DEFAULT_UNSTABLE_CLASS_PATTERNS.some((p) => p.test(cls));
        expect(matched).toBe(false);
      });
    });

  it('flags data-state-* broadly (intentional — even unfamiliar suffixes)', () => {
    const matched = DEFAULT_UNSTABLE_CLASS_PATTERNS.some((p) => p.test('data-state-foo'));
    expect(matched).toBe(true);
  });
});

describe('compile()', () => {
  it('returns an empty array for an empty input list', () => {
    expect(compile([])).toEqual([]);
  });

  it('compiles valid regex strings to RegExp instances', () => {
    const result = compile(['^my-widget-', '^acme-active$']);
    expect(result).toHaveLength(2);
    expect(result[0].test('my-widget-loading')).toBe(true);
    expect(result[1].test('acme-active')).toBe(true);
  });

  it('skips invalid regex strings silently rather than throwing', () => {
    const result = compile(['^valid$', '[unclosed', '^another-valid$']);
    expect(result).toHaveLength(2);
  });
});

describe('filterClasses()', () => {
  const patterns = [/^foo-/, /^is-active$/];

  it('returns empty array for empty input', () => {
    expect(filterClasses([], patterns)).toEqual([]);
  });

  it('returns empty array for null / undefined input defensively', () => {
    expect(filterClasses(null as unknown as string[], patterns)).toEqual([]);
    expect(filterClasses(undefined as unknown as string[], patterns)).toEqual([]);
  });

  it('preserves classes that match no pattern', () => {
    expect(filterClasses(['signup', 'cta', 'primary'], patterns)).toEqual(['signup', 'cta', 'primary']);
  });

  it('drops classes that match any pattern', () => {
    expect(filterClasses(['foo-bar', 'signup', 'is-active'], patterns)).toEqual(['signup']);
  });

  it('preserves insertion order of survivors', () => {
    const input = ['signup', 'foo-bar', 'product', 'is-active', 'cta'];
    expect(filterClasses(input, patterns)).toEqual(['signup', 'product', 'cta']);
  });

  it('skips empty-string entries', () => {
    expect(filterClasses(['', 'signup', '', 'cta'], patterns)).toEqual(['signup', 'cta']);
  });

  it('returns all classes when given no patterns', () => {
    expect(filterClasses(['a', 'b', 'c'], [])).toEqual(['a', 'b', 'c']);
  });
});
