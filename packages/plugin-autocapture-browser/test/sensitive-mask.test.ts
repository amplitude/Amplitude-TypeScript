import { SENSITIVE_MASK_LOOKAHEAD } from '../src/constants';
import { sensitiveMaskWindowEnd } from '../src/sensitive-mask';

describe('sensitiveMaskWindowEnd', () => {
  test('returns the full text when it is shorter than the cap', () => {
    expect(sensitiveMaskWindowEnd('hello there', 100)).toBe('hello there'.length);
  });

  test('ends on the last whitespace before the cap', () => {
    const text = 'hello jane.doe@example.com more';
    const cap = text.indexOf('more') + 2;
    expect(sensitiveMaskWindowEnd(text, cap)).toBe(text.indexOf('more'));
  });

  test('keeps the cap when the text has no whitespace', () => {
    expect(sensitiveMaskWindowEnd('a'.repeat(50), 20)).toBe(20);
  });

  test('ends before a spaced card instead of cutting inside it', () => {
    const card = '4111-1111 1111 1111';
    const text = `note ${card}TAIL`;
    const cap = text.indexOf(card) + '4111-1111 11'.length;
    expect(sensitiveMaskWindowEnd(text, cap)).toBe(text.indexOf(card));
  });

  test('keeps the cap when the prefix is only a spaced digit run', () => {
    const text = '4111 1111 1111 1111 extra';
    const cap = '4111 1111 11'.length;
    expect(sensitiveMaskWindowEnd(text, cap)).toBe(cap);
  });

  test('treats a newline as a boundary', () => {
    const text = 'hello\nworld-more-text';
    const cap = text.indexOf('world') + 3;
    expect(sensitiveMaskWindowEnd(text, cap)).toBe('hello\n'.length);
  });

  test('does not treat a space after a number as a card when a word follows', () => {
    const text = 'code 4111 next-token-continues';
    const cap = text.indexOf('next') + 4;
    expect(sensitiveMaskWindowEnd(text, cap)).toBe(text.indexOf('next'));
  });

  test('stops looking for the rest of a card at the lookahead limit', () => {
    const text = `note 4111 ${' '.repeat(SENSITIVE_MASK_LOOKAHEAD + 10)}9`;
    const cap = 'note 4111 '.length + 3;
    // The digit past the limit must not pull the cut back to before 4111.
    expect(sensitiveMaskWindowEnd(text, cap)).toBe(cap);
  });
});
