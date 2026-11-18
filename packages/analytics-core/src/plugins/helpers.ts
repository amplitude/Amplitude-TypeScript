export const TEXT_MASK_ATTRIBUTE = 'data-amp-mask';
export const MASKED_TEXT_VALUE = '*****';

// Regex patterns for sensitive data
export const CC_REGEX = /\b(?:\d[ -]*?){13,16}\b/;
export const SSN_REGEX = /(\d{3}-?\d{2}-?\d{4})/g;
// [^\s@]+ stops at the next @. In a URL that leaves `@domain` after the first address.
// Continue through those @ segments so the leftover cannot slide into kept text
// when the long match is replaced with a short mask.
export const EMAIL_REGEX = /[^\s@]+@[^\s@.]+\.[^\s@]+(?:@[^\s@]+)*/g;

/**
 * Replaces sensitive strings (credit cards, SSNs, emails) and custom patterns with masked text
 * @param text - The text to search for sensitive data
 * @param additionalMaskTextPatterns - Optional array of additional regex patterns to mask
 * @returns The text with sensitive data replaced by masked text
 */
export const replaceSensitiveString = (text: string | null, additionalMaskTextPatterns: RegExp[] = []): string => {
  if (typeof text !== 'string') {
    return '';
  }

  let result = text;

  // CC_REGEX is not global: repeated `.test()` calls share lastIndex.
  // A fresh global copy masks every card. One replace would leave later cards,
  // and a card past the cutoff can then slide into the kept autocapture text.
  result = result.replace(new RegExp(CC_REGEX.source, 'g'), MASKED_TEXT_VALUE);

  // Check for social security number
  result = result.replace(SSN_REGEX, MASKED_TEXT_VALUE);

  // Check for email
  result = result.replace(EMAIL_REGEX, MASKED_TEXT_VALUE);

  // Check for additional mask text patterns. Every match is masked, not only the first.
  // A later match can otherwise slide into the kept text once earlier matches shorten the prefix.
  for (const pattern of additionalMaskTextPatterns) {
    try {
      const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
      // Skip zero-length matches so a pattern like /x*/ does not insert a mask between characters.
      result = result.replace(new RegExp(pattern.source, flags), (match) =>
        match.length > 0 ? MASKED_TEXT_VALUE : match,
      );
    } catch {
      // ignore invalid pattern
    }
  }

  return result;
};

/**
 * Gets the page title, checking if the title element has data-amp-mask attribute
 * @returns The page title, masked if the title element has data-amp-mask attribute
 */
export const getPageTitle = (parseTitleFunction?: (title: string) => string): string => {
  if (typeof document === 'undefined' || !document.title) {
    return '';
  }
  const titleElement = document.querySelector('title');
  if (titleElement && titleElement.hasAttribute(TEXT_MASK_ATTRIBUTE)) {
    return MASKED_TEXT_VALUE;
  }
  return parseTitleFunction ? parseTitleFunction(document.title) : document.title; // document.title is always synced to the first title element
};
