import { SENSITIVE_MASK_LOOKAHEAD } from './constants';

const CARD_RUN = /[0-9 -]/;

/**
 * Exclusive end index for the mask-then-truncate scan.
 *
 * The scan is capped so the matchers never see unbounded text. Ending on that
 * exact character can slice an email, card, or SSN. Replacing a match with
 * `*****` shortens the prefix, and the sliced fragment can then land in the
 * kept output. Emails and SSNs cannot contain whitespace, so the window ends
 * on the last whitespace at or before the cap. That cut stays at or after
 * `minEnd`, the capture cutoff: ending earlier would drop kept text when a
 * long token has no space inside it. A space inside a run of digits belongs
 * to a card number; the window ends before that run instead. With no safe
 * whitespace in the lookahead, the cap is unchanged.
 */
export const sensitiveMaskWindowEnd = (text: string, scanEnd: number, minEnd = 0): number => {
  if (scanEnd >= text.length) {
    return text.length;
  }

  let index = scanEnd;
  while (index > minEnd) {
    while (index > minEnd && !/\s/.test(text.charAt(index - 1))) {
      index--;
    }
    if (index <= minEnd) {
      break;
    }
    const runStart = spacedDigitRunStart(text, index - 1);
    if (runStart === -1) {
      return index;
    }
    // Stepping over a card that begins in the kept region would drop that text.
    if (runStart < minEnd) {
      break;
    }
    index = runStart;
  }
  return scanEnd;
};

/**
 * When `spaceIndex` is a space between digits of a card-like run, return where
 * that run starts. Other whitespace is a safe cut.
 */
const spacedDigitRunStart = (text: string, spaceIndex: number): number => {
  if (text.charAt(spaceIndex) !== ' ') {
    return -1;
  }

  let start = spaceIndex;
  while (start > 0 && CARD_RUN.test(text.charAt(start - 1))) {
    start--;
  }
  // A space before the number is the cut we want. Keep it outside the run.
  while (start < spaceIndex && !/\d/.test(text.charAt(start))) {
    start++;
  }

  const digitsBefore = countDigits(text, start, spaceIndex);
  if (digitsBefore === 0) {
    return -1;
  }

  const limit = Math.min(text.length, spaceIndex + 1 + SENSITIVE_MASK_LOOKAHEAD);
  let digitsAfter = 0;
  for (let end = spaceIndex + 1; end < limit && CARD_RUN.test(text.charAt(end)); end++) {
    if (/\d/.test(text.charAt(end))) {
      digitsAfter++;
    }
  }
  if (digitsAfter === 0) {
    return -1;
  }
  return start;
};

const countDigits = (text: string, start: number, end: number): number => {
  let count = 0;
  for (let cursor = start; cursor < end; cursor++) {
    if (/\d/.test(text.charAt(cursor))) {
      count++;
    }
  }
  return count;
};
