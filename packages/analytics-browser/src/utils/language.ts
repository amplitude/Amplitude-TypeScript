/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
export const getLanguage = (): string => {
  // navigator.userLanguage is to support IE browsers
  return navigator?.languages?.[0] || navigator?.language || (navigator as any)?.userLanguage || '';
};
