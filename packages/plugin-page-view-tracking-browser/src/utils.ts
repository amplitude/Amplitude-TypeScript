export const omitUndefined = (input: Record<string, string | undefined>) => {
  const obj: Record<string, string> = {};
  for (const key in input) {
    const val = input[key];
    if (val) {
      obj[key] = val;
    }
  }
  return obj;
};
