/** Drop origins and queries, and template identifier-shaped path segments. */
export function urlTemplate(value: string, base = 'https://semantic.invalid/'): string {
  try {
    const parsed = new URL(value, base);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '/';
    const route = /^#!?\//.test(parsed.hash) ? '#' + parsed.hash.slice(1).split(/[?#]/)[0] : '';
    const template = (path: string) =>
      path
        .split('/')
        .map((part) => {
          let decoded: string;
          try {
            decoded = decodeURIComponent(part);
          } catch {
            return ':id';
          }
          return /^\d+$/.test(decoded) ||
            /^[\da-f]{8,}$/i.test(decoded) ||
            /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(decoded) ||
            (decoded.length >= 16 && /^[a-z\d]+$/i.test(decoded) && /[a-z]/i.test(decoded) && /\d/.test(decoded))
            ? ':id'
            : part;
        })
        .join('/');
    return template(parsed.pathname) + template(route);
  } catch {
    return '/';
  }
}
