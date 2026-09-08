// Recursively set any key named "autocapture" (object of booleans) to all-true,
// and flip common enable flags. Deep-copies so the original response is untouched.
export function forceAutocaptureOn<T>(config: T): T {
  const copy = structuredClone(config) as any;
  const walk = (node: any) => {
    if (!node || typeof node !== 'object') return;
    for (const key of Object.keys(node)) {
      const val = node[key];
      if (key === 'autocapture' && val && typeof val === 'object') {
        for (const k of Object.keys(val)) if (typeof val[k] === 'boolean') val[k] = true;
      }
      if (typeof val === 'object') walk(val);
    }
  };
  walk(copy);
  return copy;
}
