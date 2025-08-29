import * as HierarchyUtil from '../src/hierarchy';
import { DATA_AMP_MASK_ATTRIBUTES } from '../src/constants';

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
      expect(HierarchyUtil.getElementProperties(nullElement, new Set())).toEqual(null);
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
      expect(HierarchyUtil.getElementProperties(inner4, new Set())).toEqual({
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
      expect(HierarchyUtil.getElementProperties(inner, new Set())).toEqual({
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
      expect(HierarchyUtil.getElementProperties(inner, new Set())).toEqual({
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

    expect(HierarchyUtil.getElementProperties(parentlessElement, new Set())).toEqual({
      tag: 'div',
    });
  });

  describe('should filter out attributes', () => {
    test('should filter out blocked attributes', () => {
      document.getElementsByTagName('body')[0].innerHTML = `
      <div id="target" style="background-color:#fff;" ok-attribute="hi"></div>
    `;

      const target = document.getElementById('target');
      expect(HierarchyUtil.getElementProperties(target, new Set())).toEqual({
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
      expect(HierarchyUtil.getElementProperties(target, new Set())).toEqual({
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
      expect(HierarchyUtil.getElementProperties(target, new Set())).toEqual({
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
      expect(HierarchyUtil.getElementProperties(target, new Set())).toEqual({
        id: 'target',
        index: 0,
        indexOfType: 0,
        tag: 'svg',
        classes: ['test'],
      });
    });

    test(`should not capture ${DATA_AMP_MASK_ATTRIBUTES} in getElementProperties for regular elements`, () => {
      document.getElementsByTagName('body')[0].innerHTML = `
      <div id="target" ${DATA_AMP_MASK_ATTRIBUTES}="custom-attr,another-attr" custom-attr="secret" another-attr="hidden" ok-attribute="visible"></div>
    `;

      const target = document.getElementById('target');
      expect(HierarchyUtil.getElementProperties(target, new Set())).toEqual({
        id: 'target',
        index: 0,
        indexOfType: 0,
        tag: 'div',
        attrs: {
          'custom-attr': 'secret',
          'another-attr': 'hidden',
          'ok-attribute': 'visible',
        },
      });
    });

    test(`should not include ${DATA_AMP_MASK_ATTRIBUTES} in getElementProperties`, () => {
      document.getElementsByTagName('body')[0].innerHTML = `
      <div id="target" ${DATA_AMP_MASK_ATTRIBUTES}="custom-attr" custom-attr="secret" other-attr="visible"></div>
    `;

      const target = document.getElementById('target');

      // getElementProperties should not include DATA_AMP_MASK_ATTRIBUTES
      const elementProps = HierarchyUtil.getElementProperties(target, new Set());
      expect(elementProps?.attrs?.[DATA_AMP_MASK_ATTRIBUTES]).toBeUndefined();
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

  // Note: getHierarchy has been moved to data-extractor.test.ts
  // as it is now an instance method of DataExtractor
});
