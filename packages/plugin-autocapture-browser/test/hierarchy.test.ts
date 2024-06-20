import { getAncestors, getElementProperties, getHierarchy } from '../src/hierarchy';

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
      expect(getElementProperties(nullElement)).toEqual(null);
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
      expect(getElementProperties(inner4)).toEqual({
        id: 'inner4',
        index: 3,
        indexOfType: 1,
        previousSiblingTag: 'a',
        tag: 'a',
      });
    });

    test('should not return previousSiblingTag if it has no previous siblings', () => {
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
      expect(getElementProperties(inner)).toEqual({
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
      expect(getElementProperties(inner)).toEqual({
        id: 'inner',
        index: 0,
        indexOfType: 0,
        tag: 'div',
        class: ['class1', 'class2'],
      });
    });
  });

  test('should not fail when parent element is null', () => {
    const parentlessElement = document.createElement('div');

    expect(getElementProperties(parentlessElement)).toEqual({
      tag: 'div',
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
    expect(getAncestors(inner)).toEqual([
      inner,
      document.getElementById('parent1'),
      document.getElementById('parent2'),
      document.body,
    ]);
  });

  test('should not fail when element is null', () => {
    const nullElement = null;
    expect(getAncestors(nullElement)).toEqual([]);
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

    expect(getHierarchy(inner2)).toEqual([
      {
        index: 1,
        indexOfType: 0,
        previousSiblingTag: 'head',
        tag: 'body',
      },
      {
        id: 'parent2',
        index: 0,
        indexOfType: 0,
        tag: 'div',
      },
      {
        id: 'parent1',
        index: 0,
        indexOfType: 0,
        tag: 'div',
      },
      {
        id: 'inner2',
        index: 1,
        indexOfType: 1,
        previousSiblingTag: 'div',
        tag: 'div',
      },
    ]);
  });

  test('should not fail when element is null', () => {
    const nullElement = null;
    expect(getHierarchy(nullElement)).toEqual([]);
  });
});
