export const TEXT_MASK_ATTRIBUTE = 'data-amp-mask';
export const MASKED_TEXT_VALUE = '*****';

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
