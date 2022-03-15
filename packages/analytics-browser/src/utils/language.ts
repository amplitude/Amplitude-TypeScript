export const getLanguage = (): string => {
  if (typeof navigator === 'undefined') return '';
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  const userLanguage = (navigator as any).userLanguage as string | undefined;

  return navigator.languages?.[0] ?? navigator.language ?? userLanguage ?? '';
};
