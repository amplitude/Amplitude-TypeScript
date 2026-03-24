export const omitUndefined = <T extends Record<string, string | undefined>>(input: T): Partial<T> => {
  const output: Partial<T> = {};

  for (const key in input) {
    const value = input[key];
    if (value) {
      output[key] = value;
    }
  }

  return output;
};
