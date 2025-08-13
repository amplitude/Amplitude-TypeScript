import { isPathMatch, tokenizeJsonPath, pruneJson } from '../../src/utils/json-query';

describe('pruneJson', () => {
  describe('empty json', () => {
    test('should pass through null objects', () => {
      const obj = null;
      pruneJson(obj, ['a'], []);
      expect(obj).toEqual(null);
    });

    test('should pass through undefined objects', () => {
      const obj = undefined;
      pruneJson(obj, ['a'], []);
      expect(obj).toEqual(undefined);
    });
  });

  describe('flat json', () => {
    describe('top level keys', () => {
      test('should match single key', () => {
        const obj = { a: 'b', c: 'd' };
        pruneJson(obj, ['a'], []);
        expect(obj).toEqual({ a: 'b' });
      });

      test('should match multiple keys', () => {
        const obj = { a: 'b', c: 'd', e: 'f' };
        pruneJson(obj, ['a', 'c'], []);
        expect(obj).toEqual({ a: 'b', c: 'd' });
      });

      test('should match multiple keys with wildcards', () => {
        const obj = { a: 'b', c: 'd', e: 'f' };
        pruneJson(obj, ['*'], ['e']);
        expect(obj).toEqual({ a: 'b', c: 'd' });
      });
    });
  });

  describe('one level deep', () => {
    test('should match single key', () => {
      const obj = { a: { b: 'c', d: 'e' } };
      pruneJson(obj, ['a/b'], []);
      expect(obj).toEqual({ a: { b: 'c' } });
    });

    test('should match with **', () => {
      const obj = { a: { b: { c: 'd', e: 'f' } } };
      pruneJson(obj, ['a/**'], ['a/b/e']);
      expect(obj).toEqual({ a: { b: { c: 'd' } } });
    });

    test('should match with *', () => {
      const obj = { a: { b: { c: 'd', e: 'f' }, e: 'f' } };
      pruneJson(obj, ['a/*'], []);
      expect(obj).toEqual({ a: { e: 'f' } });
    });

    test('should cleanup empty objects', () => {
      const obj = { a: { b: { c: 'd' }, e: 'f' } };
      pruneJson(obj, ['a/b'], []);
      expect(obj).toEqual({});
    });
  });

  describe('two levels deep', () => {
    test('should match single key', () => {
      const obj = { a: { b: { c: 'd', e: 'f' } } };
      pruneJson(obj, ['a/b/c'], []);
      expect(obj).toEqual({ a: { b: { c: 'd' } } });
    });

    test('should match with **', () => {
      const obj = { a: { b: { c: 'd', e: 'f' } } };
      pruneJson(obj, ['a/**'], []);
      expect(obj).toEqual({ a: { b: { c: 'd', e: 'f' } } });
    });

    test('should match with *', () => {
      const obj = { a: { b: { c: 'd', e: 'f' }, e: 'f' } };
      pruneJson(obj, ['a/*'], []);
      expect(obj).toEqual({ a: { e: 'f' } });
    });

    test('should cleanup empty objects', () => {
      const obj = { a: { b: { c: 'd', e: 'f' } }, g: 'h' };
      pruneJson(obj, ['*'], []);
      expect(obj).toEqual({ g: 'h' });
    });

    test('should not cleanup empty objects if they are not empty', () => {
      const obj = { a: { b: { c: 'd' }, e: 'f' } };
      pruneJson(obj, ['a/*'], []);
      expect(obj).toEqual({ a: { e: 'f' } });
    });

    test('should match on **', () => {
      const obj = { a: { b: { c: 'd', e: 'f' } }, g: 'h' };
      pruneJson(obj, ['a/**'], []);
      expect(obj).toEqual({ a: { b: { c: 'd', e: 'f' } } });
    });
  });

  describe('three levels deep', () => {
    test('should match on *', () => {
      const obj = { a: { f: 'f', b: { c: { d: 'e', f: 'f' } } } };
      pruneJson(obj, ['*/f'], []);
      expect(obj).toEqual({ a: { f: 'f' } });
    });

    test('should match any key after **', () => {
      const obj = { a: { f: 'f', b: { c: { d: 'e', f: 'f' } } } };
      pruneJson(obj, ['**/f'], []);
      expect(obj).toEqual({ a: { f: 'f', b: { c: { f: 'f' } } } });
    });
    test('should exclude everything if exclude list is **', () => {
      const obj = { a: { b: { c: 'd', e: 'f' } }, g: 'h' };
      pruneJson(obj, ['a/g'], ['**']);
      expect(obj).toEqual({});
    });
  });

  describe('arrays', () => {
    test('should match on *', () => {
      const obj = { a: [1, 2, 3] };
      pruneJson(obj, ['a/*'], []);
      expect(obj).toEqual({ a: [1, 2, 3] });
    });

    test('should match on specific index', () => {
      const obj = { a: [1, 2, 3] };
      pruneJson(obj, ['a/1'], []);
      expect(obj).toEqual({ a: [undefined, 2, undefined] });
    });

    test('should match all indices with * but exclude specific index', () => {
      const obj = { a: [1, 2, 3] };
      pruneJson(obj, ['a/*'], ['a/1']);
      expect(obj).toEqual({ a: [1, undefined, 3] });
    });
  });
});

describe('tokenizePath', () => {
  test('should tokenize paths with /', () => {
    expect(tokenizeJsonPath('a/b/c')).toEqual(['a', 'b', 'c']);
    expect(tokenizeJsonPath('a/*/**/c')).toEqual(['a', '*', '**', 'c']);
  });

  test('should accept leading /', () => {
    expect(tokenizeJsonPath('/a/b/c')).toEqual(['a', 'b', 'c']);
    expect(tokenizeJsonPath('/a/*/**/c')).toEqual(['a', '*', '**', 'c']);
  });

  test('should tokenize paths with single token', () => {
    expect(tokenizeJsonPath('a')).toEqual(['a']);
    expect(tokenizeJsonPath('a*')).toEqual(['a*']);
  });

  test('should translate ~0 to ~', () => {
    expect(tokenizeJsonPath('a/b~0~0c/c~0~0d')).toEqual(['a', 'b~~c', 'c~~d']);
  });

  test('should translate ~1 to /', () => {
    expect(tokenizeJsonPath('a/b~1~1c/c~1~1d')).toEqual(['a', 'b//c', 'c//d']);
  });

  test('should not translate ~ if not in ~0 or ~1', () => {
    expect(tokenizeJsonPath('a/b~c/c~d')).toEqual(['a', 'b~c', 'c~d']);
  });
});

describe('isPathMatching', () => {
  describe('should be true', () => {
    test('if path and patchMatcher are identical', () => {
      expect(isPathMatch(['a'], ['a'])).toBe(true);
      expect(isPathMatch(['a', 'b'], ['a', 'b'])).toBe(true);
      expect(isPathMatch(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(true);
    });

    test('if path and patchMatchers match with wildcards', () => {
      expect(isPathMatch(['a'], ['*'])).toBe(true);
      expect(isPathMatch(['a', 'b'], ['a', '*'])).toBe(true);
      expect(isPathMatch(['a', 'b', 'c'], ['a', '*', 'c'])).toBe(true);
      expect(isPathMatch(['a', 'b', 'c'], ['*', '*', '*'])).toBe(true);
    });

    test('if pathMatcher is double wildcard (**)', () => {
      expect(isPathMatch(['a'], ['**'])).toBe(true);
      expect(isPathMatch(['a', 'b', 'c'], ['**'])).toBe(true);
      expect(isPathMatch(['a', 'b'], ['a', '**'])).toBe(true);
      expect(isPathMatch(['a', 'b', 'c'], ['a', '**'])).toBe(true);
      expect(isPathMatch(['a', 'b', 'c', 'b', 'd'], ['a', '**', 'b', 'd'])).toBe(true);
      expect(isPathMatch(['a', 'b'], ['a', '**', 'b'])).toBe(true);
    });
  });

  describe('should be false', () => {
    test('if path and patchMatchers do not match (no wildcards)', () => {
      expect(isPathMatch(['a'], ['b'])).toBe(false);
      expect(isPathMatch(['a', 'b'], ['a'])).toBe(false);
      expect(isPathMatch(['a', 'b', 'c'], ['a', 'b', 'd'])).toBe(false);
    });

    test('if path and patchMatchers do not match (wildcard)', () => {
      expect(isPathMatch(['a', 'b', 'c'], ['a', 'b', 'c', '*'])).toBe(false);
      expect(isPathMatch(['a', 'b', 'c'], ['a', 'b', '*', 'c'])).toBe(false);
      expect(isPathMatch(['a', 'b', 'c'], ['*', '*'])).toBe(false);
    });

    test('if path and patchMatchers do not match (double wildcard)', () => {
      expect(isPathMatch(['a', 'b', 'c'], ['a', '**', 'b', 'd'])).toBe(false);
      expect(isPathMatch(['a', 'b', 'c'], ['a', '**', 'd'])).toBe(false);
      expect(isPathMatch(['a', 'b', 'c'], ['a', '**', '**', 'd'])).toBe(false);
    });
  });
});
