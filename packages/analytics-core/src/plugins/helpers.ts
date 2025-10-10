export const TEXT_MASK_ATTRIBUTE = 'data-amp-mask';
export const MASKED_TEXT_VALUE = '*****';

// Regex patterns for sensitive data
export const CC_REGEX = /\b(?:\d[ -]*?){13,16}\b/;
export const SSN_REGEX = /(\d{3}-?\d{2}-?\d{4})/g;
export const EMAIL_REGEX = /[^\s@]+@[^\s@.]+\.[^\s@]+/g;

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

  // Check for credit card number (with or without spaces/dashes)
  result = result.replace(CC_REGEX, MASKED_TEXT_VALUE);

  // Check for social security number
  result = result.replace(SSN_REGEX, MASKED_TEXT_VALUE);

  // Check for email
  result = result.replace(EMAIL_REGEX, MASKED_TEXT_VALUE);

  // Check for additional mask text patterns
  for (const pattern of additionalMaskTextPatterns) {
    try {
      result = result.replace(pattern, MASKED_TEXT_VALUE);
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
