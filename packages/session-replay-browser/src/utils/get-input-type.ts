/**
 * Get the input type of an HTML element.
 * This is a utility function that was extracted from rrweb-snapshot
 * to reduce dependencies.
 *
 * @param element - The HTML element to get the input type from
 * @returns The input type as a string, or empty string if not applicable
 */
export function getInputType(element: HTMLElement): string {
  if (!element) {
    return '';
  }

  // If it's an input element, return its type
  if (element.tagName === 'INPUT') {
    const inputElement = element as HTMLInputElement;
    return inputElement.type || 'text'; // Default to 'text' if type is not specified
  }

  // For other elements that might have input-like behavior
  if (element.tagName === 'TEXTAREA') {
    return 'textarea';
  }

  if (element.tagName === 'SELECT') {
    return 'select';
  }

  // Return empty string for non-input elements
  return '';
}
