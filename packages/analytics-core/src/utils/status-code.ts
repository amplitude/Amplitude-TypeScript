/**
 * Checks if an HTTP status code indicates success (2xx range)
 * @param code - The HTTP status code to check
 * @returns true if the status code is in the 2xx range, false otherwise
 */
export function isSuccessStatusCode(code: number): boolean {
  return code >= 200 && code < 300;
}
