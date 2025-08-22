import * as HierarchyUtil from '../src/hierarchy';

describe('autocapture-plugin hierarchy', () => {
  afterEach(() => {
    document.getElementsByTagName('body')[0].innerHTML = '';
    jest.clearAllMocks();
  });

  describe('getElementProperties', () => {
    test('should return null when element is null', () => {
      document.getElementsByTagName('body')[0].innerHTML = `
        <div id="parent2">
          <div id="parent1">
            <div id="inner">
              xxx
            </div>
          </div>
        </div>
      `;

      const nullElement = document.getElementById('null-element');
      expect(HierarchyUtil.getElementProperties(nullElement)).toEqual(null);
    });

    test('should return tag and index information if element has siblings', () => {
      document.getElementsByTagName('body')[0].innerHTML = `
        <div id="container">
          <div id="inner">
            xxx
          </div>
          <div id="inner2">
            xxx
          </div>
          <a id="inner3">
            xxx
          </a>
          <a id="inner4">
            xxx
          </a>
        </div>
      `;

      const inner4 = document.getElementById('inner4');
      expect(HierarchyUtil.getElementProperties(inner4)).toEqual({
        id: 'inner4',
        index: 3,
        indexOfType: 1,
        prevSib: 'a',
        tag: 'a',
      });
    });

    test('should not return prevSib if it has no previous siblings', () => {
      document.getElementsByTagName('body')[0].innerHTML = `
        <div id="container">
          <div id="inner">
            xxx
          </div>
          <div id="inner2">
            xxx
          </div>
        </div>
      `;

      const inner = document.getElementById('inner');
      expect(HierarchyUtil.getElementProperties(inner)).toEqual({
        id: 'inner',
        index: 0,
        indexOfType: 0,
        tag: 'div',
      });
    });

    test('should return effective class list correctly', () => {
      document.getElementsByTagName('body')[0].innerHTML = `
        <div id="container">
          <div id="inner" class="class1 class2 class2">
            xxx
          </div>
        </div>
      `;

      const inner = document.getElementById('inner');
      expect(HierarchyUtil.getElementProperties(inner)).toEqual({
        id: 'inner',
        index: 0,
        indexOfType: 0,
        tag: 'div',
        classes: ['class1', 'class2'],
      });
    });
  });

  test('should not fail when parent element is null', () => {
    const parentlessElement = document.createElement('div');

    expect(HierarchyUtil.getElementProperties(parentlessElement)).toEqual({
      tag: 'div',
    });
  });

  describe('should filter out attributes', () => {
    test('should filter out blocked attributes', () => {
      document.getElementsByTagName('body')[0].innerHTML = `
      <div id="target" style="background-color:#fff;" ok-attribute="hi"></div>
    `;

      const target = document.getElementById('target');
      expect(HierarchyUtil.getElementProperties(target)).toEqual({
        id: 'target',
        index: 0,
        indexOfType: 0,
        tag: 'div',
        attrs: {
          'ok-attribute': 'hi',
        },
      });
    });

    test('should filter out all non whitelisted attributes from sensitive elements', () => {
      document.getElementsByTagName('body')[0].innerHTML = `
      <input id="target" type="checkbox" style="background-color:#fff;" ok-attribute="hi"></input>
    `;

      const target = document.getElementById('target');
      expect(HierarchyUtil.getElementProperties(target)).toEqual({
        id: 'target',
        index: 0,
        indexOfType: 0,
        tag: 'input',
        attrs: {
          type: 'checkbox',
        },
      });
    });

    test('should filter out all attributes from highly sensitive elements', () => {
      document.getElementsByTagName('body')[0].innerHTML = `
      <input id="target" class="test" type="password" ok-attribute="hi"></input>
    `;

      const target = document.getElementById('target');
      expect(HierarchyUtil.getElementProperties(target)).toEqual({
        id: 'target',
        index: 0,
        indexOfType: 0,
        tag: 'input',
        classes: ['test'],
      });
    });

    test('should discard attributes for svg-related elements', () => {
      document.getElementsByTagName('body')[0].innerHTML = `
      <svg id="target" class="test" ok-attribute="hi"></svg>
    `;

      const target = document.getElementById('target');
      expect(HierarchyUtil.getElementProperties(target)).toEqual({
        id: 'target',
        index: 0,
        indexOfType: 0,
        tag: 'svg',
        classes: ['test'],
      });
    });

    test('should NOT redact child id or class when both specified in parent data-amp-mask-attributes', () => {
      document.getElementsByTagName('body')[0].innerHTML = `
        <div data-amp-mask-attributes="id, class">
          <div id="secret-id" class="secret-class" data-test="visible">
            xxx
          </div>
        </div>
      `;

      const target = document.querySelector('[id="secret-id"]');
      const result = HierarchyUtil.getElementProperties(target);

      expect(result).toEqual({
        id: 'secret-id', // ID should NOT be redacted even when specified
        classes: ['secret-class'], // Class should NOT be redacted even when specified
        index: 0,
        indexOfType: 0,
        tag: 'div',
        attrs: {
          'data-test': 'visible',
        },
      });
    });

    test('should redact attributes when redaction rule is on element itself but never redact id or class', () => {
      document.getElementsByTagName('body')[0].innerHTML = `
        <div id="target" class="target-class" data-secret="sensitive" data-amp-mask-attributes="id, class, data-secret">
          xxx
        </div>
      `;

      const target = document.getElementById('target');
      const result = HierarchyUtil.getElementProperties(target);

      expect(result).toEqual({
        id: 'target', // ID should NEVER be redacted
        classes: ['target-class'], // Class should NEVER be redacted
        index: 0,
        indexOfType: 0,
        tag: 'div',
        attrs: {
          'data-amp-mask-attributes': 'id, class, data-secret', // The redaction attribute itself is also included
          // data-secret should be redacted and not appear here
        },
      });
    });

    test('should redact specific attributes from hierarchy when specified on parent', () => {
      document.getElementsByTagName('body')[0].innerHTML = `
        <div data-amp-mask-attributes="data-secret">
          <div id="target" data-secret="sensitive-value" data-public="public-value">
            xxx
          </div>
        </div>
      `;

      const target = document.getElementById('target');
      const result = HierarchyUtil.getElementProperties(target);

      expect(result).toEqual({
        id: 'target',
        index: 0,
        indexOfType: 0,
        tag: 'div',
        attrs: {
          'data-public': 'public-value',
        },
      });
    });

    test('should inherit redaction rules from multiple ancestor levels but preserve id and class', () => {
      document.getElementsByTagName('body')[0].innerHTML = `
        <div data-amp-mask-attributes="id">
          <div data-amp-mask-attributes="class, data-level2">
            <div id="target-id" class="target-class" data-level2="secret" data-safe="ok">
              xxx
            </div>
          </div>
        </div>
      `;

      const target = document.querySelector('[id="target-id"]');
      const result = HierarchyUtil.getElementProperties(target);

      expect(result).toEqual({
        id: 'target-id', // ID should NOT be redacted even when specified in ancestor
        classes: ['target-class'], // Class should NOT be redacted even when specified in ancestor
        index: 0,
        indexOfType: 0,
        tag: 'div',
        attrs: {
          'data-safe': 'ok',
        },
      });
    });
  });
});

describe('getAncestors', () => {
  test('should return a list starting from the target element', () => {
    document.getElementsByTagName('body')[0].innerHTML = `
      <div id="parent2">
        <div id="parent1">
          <div id="inner">
            xxx
          </div>
        </div>
      </div>
    `;

    const inner = document.getElementById('inner');
    expect(HierarchyUtil.getAncestors(inner)).toEqual([
      inner,
      document.getElementById('parent1'),
      document.getElementById('parent2'),
      document.body,
    ]);
  });

  test('should not fail when element is null', () => {
    const nullElement = null;
    expect(HierarchyUtil.getAncestors(nullElement)).toEqual([]);
  });
});

describe('getHierarchy', () => {
  test('should return a list starting from the target element', () => {
    document.getElementsByTagName('body')[0].innerHTML = `
      <div id="parent2">
        <div id="parent1">
          <div id="inner">
            xxx
          </div>
          <div id="inner2">
            xxx
          </div>
        </div>
      </div>
    `;

    const inner2 = document.getElementById('inner2');

    expect(HierarchyUtil.getHierarchy(inner2)).toEqual([
      {
        id: 'inner2',
        index: 1,
        indexOfType: 1,
        prevSib: 'div',
        tag: 'div',
      },
      {
        id: 'parent1',
        index: 0,
        indexOfType: 0,
        tag: 'div',
      },
      {
        id: 'parent2',
        index: 0,
        indexOfType: 0,
        tag: 'div',
      },
      {
        index: 1,
        indexOfType: 0,
        prevSib: 'head',
        tag: 'body',
      },
    ]);
  });

  test('should not fail when element is null', () => {
    const nullElement = null;
    expect(HierarchyUtil.getHierarchy(nullElement)).toEqual([]);
  });

  describe('[Amplitude] Element Hierarchy property:', () => {
    test('should cut off hierarchy output nodes to stay less than or equal to 1024 chars', () => {
      document.getElementsByTagName('body')[0].innerHTML = `
      <div id="parent2">
        <div id="parent1"
          long-attribute="${'a'.repeat(2000)}end"
          long-attribute2="${'a'.repeat(128)}"
          long-attribute3="${'a'.repeat(128)}"
          long-attribute4="${'a'.repeat(128)}"
          long-attribute5="${'a'.repeat(128)}"
          attribute6="${'a'.repeat(8)}"
        >
          <div id="inner12345">
            xxx
          </div>
        </div>
      </div>
    `;

      const inner12345 = document.getElementById('inner12345');
      const innerHierarchy = HierarchyUtil.getHierarchy(inner12345);
      // expect innerHierarchy to not have body to stay under 1024 chars
      expect(innerHierarchy).toEqual([
        {
          id: 'inner12345',
          index: 0,
          indexOfType: 0,
          tag: 'div',
        },
        {
          id: 'parent1',
          index: 0,
          indexOfType: 0,
          tag: 'div',
          attrs: {
            'long-attribute': 'a'.repeat(128),
            'long-attribute2': 'a'.repeat(128),
            'long-attribute3': 'a'.repeat(128),
            'long-attribute4': 'a'.repeat(128),
            'long-attribute5': 'a'.repeat(128),
            attribute6: 'a'.repeat(8),
          },
        },
        {
          id: 'parent2',
          index: 0,
          indexOfType: 0,
          tag: 'div',
        },
      ]);
      const resultLength = JSON.stringify(innerHierarchy).length;
      expect(resultLength).toBeLessThanOrEqual(1024);
      expect(resultLength).toEqual(947);
    });
  });

  describe('ensureUnicodePythonCompatible', () => {
    // Test null values
    test('handles null values', () => {
      expect(HierarchyUtil.ensureUnicodePythonCompatible(null)).toBeNull();
      expect(HierarchyUtil.ensureUnicodePythonCompatible(null, true)).toBe('None');
    });

    test('handles simple string', () => {
      expect(HierarchyUtil.ensureUnicodePythonCompatible('abc')).toBe('abc');
    });

    test('handles string with double quote', () => {
      expect(HierarchyUtil.ensureUnicodePythonCompatible('ab"c', true)).toBe(`'ab"c'`);
    });

    test('handles string with single quote', () => {
      expect(HierarchyUtil.ensureUnicodePythonCompatible(`ab'c`, true)).toBe(`"ab\\'c"`);
    });

    test('handles number', () => {
      expect(HierarchyUtil.ensureUnicodePythonCompatible(123)).toBe('123');
    });

    test('handles boolean values', () => {
      expect(HierarchyUtil.ensureUnicodePythonCompatible(true)).toBe('True');
      expect(HierarchyUtil.ensureUnicodePythonCompatible(false)).toBe('False');
    });

    test('handles array with mixed types', () => {
      expect(HierarchyUtil.ensureUnicodePythonCompatible([123, 'abc'])).toBe("[123, 'abc']");
    });

    test('handles object with mixed types', () => {
      const result = HierarchyUtil.ensureUnicodePythonCompatible({ abc: 123, def: 'what' });
      expect(result === "{'abc': 123, 'def': 'what'}" || result === "{'def': 'what', 'abc': 123}").toBeTruthy();
    });

    test('handles object with value of string with single quote', () => {
      expect(HierarchyUtil.ensureUnicodePythonCompatible({ key: `ab'c` }, true)).toBe(`{\\'key\\': "ab\\\\'c"}`);
    });

    // Test edge cases
    test('handles edge cases', () => {
      expect(HierarchyUtil.ensureUnicodePythonCompatible('')).toBe('');
      expect(HierarchyUtil.ensureUnicodePythonCompatible('', true)).toBe("''");
      expect(HierarchyUtil.ensureUnicodePythonCompatible({})).toBe('{}');
      expect(HierarchyUtil.ensureUnicodePythonCompatible([])).toBe('[]');
    });

    test('returns null when error is thrown', () => {
      const replaceSpy = jest.spyOn(String.prototype, 'replace');
      replaceSpy.mockImplementation(() => {
        throw new Error('Invalid value');
      });

      expect(HierarchyUtil.ensureUnicodePythonCompatible('h"i', true)).toBe(null);
      replaceSpy.mockRestore();
    });
  });

  describe('ensureListUnderLimit', () => {
    test('returns full list when under limit', () => {
      expect(HierarchyUtil.ensureListUnderLimit([123, 'abc'], 100)).toEqual([123, 'abc']);
    });

    test('drops second element when over limit', () => {
      expect(HierarchyUtil.ensureListUnderLimit([123, 'abc'], 5)).toEqual([123]);
    });

    test('returns empty list when all elements exceed limit', () => {
      expect(HierarchyUtil.ensureListUnderLimit([123, 'abc'], 2)).toEqual([]);
    });

    test('handles null values correctly', () => {
      const arr = [null, null, 12, null, 'hello'];
      expect(HierarchyUtil.ensureListUnderLimit(arr, 15)).toEqual([null, null, 12, null]);
    });

    test('handles Unicode characters correctly', () => {
      expect(HierarchyUtil.ensureListUnderLimit(['😊😊 .', '.', '💛', '😊'], 6)).toEqual(['😊😊 .', '.', '💛']);
    });

    test('handles surrogate pairs correctly', () => {
      expect(HierarchyUtil.ensureListUnderLimit(['\uD83D', '\uDE0A', '\uD83D', '\uDE0A', '.'], 3)).toEqual([
        '\uD83D',
        '\uDE0A',
        '\uD83D',
      ]);
    });

    test('returns length 4 when error is thrown in ensureUnicodePythonCompatible', () => {
      const replaceSpy = jest.spyOn(Object, 'entries');
      // eslint-disable-next-line
      // @ts-ignore
      replaceSpy.mockReturnValue(null);

      expect(HierarchyUtil.ensureListUnderLimit([{}], 3)).toEqual([]);
      expect(HierarchyUtil.ensureListUnderLimit([{}], 4)).toEqual([{}]);
    });
  });
});
