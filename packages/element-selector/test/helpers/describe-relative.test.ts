/**
 * @jest-environment jsdom
 */
import { describeRelative } from '../../src/helpers/describe-relative';

function setupDOM(html: string): Element {
  document.body.innerHTML = html;
  return document.body.firstElementChild as Element;
}

describe('describeRelative()', () => {
  it('emits a single tag:nth-of-type(1) segment for a one-element trail with no same-tag siblings', () => {
    const anchor = setupDOM('<section><button>Click</button></section>');
    const button = anchor.querySelector('button') as Element;
    expect(describeRelative(anchor, [button])).toBe('button:nth-of-type(1)');
  });

  it('uses the correct nth-of-type index when there are same-tag siblings', () => {
    const anchor = setupDOM(`
      <section>
        <button>First</button>
        <button>Second</button>
        <button>Third</button>
      </section>
    `);
    const buttons = anchor.querySelectorAll('button');
    expect(describeRelative(anchor, [buttons[0]])).toBe('button:nth-of-type(1)');
    expect(describeRelative(anchor, [buttons[1]])).toBe('button:nth-of-type(2)');
    expect(describeRelative(anchor, [buttons[2]])).toBe('button:nth-of-type(3)');
  });

  it('counts only same-tag siblings (ignores different tag types in between)', () => {
    const anchor = setupDOM(`
      <section>
        <h2>Heading</h2>
        <p>Paragraph</p>
        <button>First</button>
        <span>Span</span>
        <button>Second</button>
      </section>
    `);
    const buttons = anchor.querySelectorAll('button');
    // First button is the 1st :nth-of-type even though it's the 3rd child.
    expect(describeRelative(anchor, [buttons[0]])).toBe('button:nth-of-type(1)');
    // Second button is the 2nd :nth-of-type even though it's the 5th child.
    expect(describeRelative(anchor, [buttons[1]])).toBe('button:nth-of-type(2)');
  });

  it('joins multi-step trails with " > "', () => {
    const anchor = setupDOM(`
      <main>
        <section>
          <ul>
            <li>One</li>
            <li>Two</li>
            <li><a href="/three">Three</a></li>
          </ul>
        </section>
      </main>
    `);
    const section = anchor.querySelector('section') as Element;
    const ul = anchor.querySelector('ul') as Element;
    const li = anchor.querySelectorAll('li')[2];
    const a = anchor.querySelector('a') as Element;

    expect(describeRelative(anchor, [section, ul, li, a])).toBe(
      'section:nth-of-type(1) > ul:nth-of-type(1) > li:nth-of-type(3) > a:nth-of-type(1)',
    );
  });

  it('returns the empty string for an empty trail', () => {
    const anchor = setupDOM('<section></section>');
    expect(describeRelative(anchor, [])).toBe('');
  });

  it('defensively emits just the tag for a detached element', () => {
    const orphan = document.createElement('button');
    // Detached element — has no parent. Our function shouldn't crash.
    expect(describeRelative(document.body, [orphan])).toBe('button');
  });
});
