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
        classes: ['class1', 'class2'],
      });
    });
  });

  test('should not fail when parent element is null', () => {
    const parentlessElement = document.createElement('div');

    expect(getElementProperties(parentlessElement)).toEqual({
      tag: 'div',
    });
  });

  describe('should filter out attributes', () => {
    test('should filter out blocked attributes', () => {
      document.getElementsByTagName('body')[0].innerHTML = `
      <div id="target" style="background-color:#fff;" ok-attribute="hi"></div>
    `;

      const target = document.getElementById('target');
      expect(getElementProperties(target)).toEqual({
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
      expect(getElementProperties(target)).toEqual({
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
      expect(getElementProperties(target)).toEqual({
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
      expect(getElementProperties(target)).toEqual({
        id: 'target',
        index: 0,
        indexOfType: 0,
        tag: 'svg',
        classes: ['test'],
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
        prevSib: 'head',
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
        prevSib: 'div',
        tag: 'div',
      },
    ]);
  });

  test('should not fail when element is null', () => {
    const nullElement = null;
    expect(getHierarchy(nullElement)).toEqual([]);
  });

  test('should cut off hierarchy output nodes to stay less than or equal to 1024 chars', () => {
    document.getElementsByTagName('body')[0].innerHTML = `
      <div id="parent2">
        <div id="parent1"
          long-attribute="${'a'.repeat(2000)}end"
          long-attribute2="${'a'.repeat(128)}"
          long-attribute3="${'a'.repeat(128)}"
          long-attribute4="${'a'.repeat(128)}"
          long-attribute5="${'a'.repeat(128)}"
          attribute6="${'a'.repeat(85)}"
        >
          <div id="inner12345">
            xxx
          </div>
        </div>
      </div>
    `;

    const inner12345 = document.getElementById('inner12345');
    const innerHierarchy = getHierarchy(inner12345);
    expect(innerHierarchy).toEqual([
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
        attrs: {
          'long-attribute': 'a'.repeat(128),
          'long-attribute2': 'a'.repeat(128),
          'long-attribute3': 'a'.repeat(128),
          'long-attribute4': 'a'.repeat(128),
          'long-attribute5': 'a'.repeat(128),
          attribute6: 'a'.repeat(85),
        },
      },
      {
        id: 'inner12345',
        index: 0,
        indexOfType: 0,
        tag: 'div',
      },
    ]);

    expect(JSON.stringify(innerHierarchy).length).toEqual(1024);
  });
});
