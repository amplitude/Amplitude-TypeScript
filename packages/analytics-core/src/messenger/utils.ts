/* eslint-disable no-restricted-globals */

/**
 * Dynamically loads an external script by appending a <script> tag to the document head.
 * Deduplicates by checking if a script with the same src already exists.
 */
export const asyncLoadScript = (url: string): Promise<{ status: boolean }> => {
  // Dedup: if a script with this src already exists, resolve immediately
  const existing = document.querySelector(`script[src="${CSS.escape(url)}"]`);
  if (existing) {
    return Promise.resolve({ status: true });
  }

  return new Promise((resolve, reject) => {
    try {
      const scriptElement = document.createElement('script');
      scriptElement.type = 'text/javascript';
      scriptElement.async = true;
      scriptElement.src = url;
      scriptElement.addEventListener(
        'load',
        () => {
          resolve({ status: true });
        },
        { once: true },
      );
      scriptElement.addEventListener('error', () => {
        reject({
          status: false,
          message: `Failed to load the script ${url}`,
        });
      });
      /* istanbul ignore next */
      document.head?.appendChild(scriptElement);
    } catch (error) {
      /* istanbul ignore next */
      reject(error);
    }
  });
};

/**
 * Generates a simple unique ID for message request/response correlation.
 */
export function generateUniqueId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
