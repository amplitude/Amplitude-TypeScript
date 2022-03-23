import { getLanguage } from '../../src/utils/language';
interface Navigator {
  language: string | undefined;
  languages: string[] | undefined;
  userLanguage: string | undefined;
}

describe('language', () => {
  // Simulates other browser version
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const nav: Navigator = navigator;

  beforeAll(() => {
    Object.defineProperty(nav, 'userLanguage', {
      get: () => '',
      configurable: true,
      enumerable: true,
    });
  });

  afterAll(() => {
    if (nav.userLanguage) {
      delete nav.userLanguage;
    }
  });

  test('should return a language', () => {
    enableNavigatorLanguageProperties(['languages', 'language', 'userLanguage']);
    expect(getLanguage()).not.toBeNull();
  });

  test('should prioritize the first language of navigator.languages', () => {
    enableNavigatorLanguageProperties(['languages', 'language', 'userLanguage']);
    expect(getLanguage()).toBe('some-locale');
  });

  test('should secondly use the language of navigator.language', () => {
    enableNavigatorLanguageProperties(['language', 'userLanguage']);
    expect(getLanguage()).toBe('some-second-locale');
  });

  test('should thirdly use the language of navigator.userLanguage', () => {
    enableNavigatorLanguageProperties(['userLanguage']);
    expect(getLanguage()).toBe('some-third-locale');
  });

  test('should return empty string if navigator language is not set', () => {
    enableNavigatorLanguageProperties([]);
    expect(getLanguage()).toBe('');
  });

  test('should return empty string if navigator is not set', () => {
    jest.spyOn(window as any, 'navigator', 'get').mockReturnValue(undefined);
    expect(getLanguage()).toBe('');
  });

  function enableNavigatorLanguageProperties(properties: Array<'languages' | 'language' | 'userLanguage'>) {
    jest
      .spyOn(nav, 'languages', 'get')
      .mockReturnValue(properties.includes('languages') ? ['some-locale', 'some-other-locale'] : undefined);
    jest
      .spyOn(nav, 'language', 'get')
      .mockReturnValue(properties.includes('language') ? 'some-second-locale' : undefined);
    jest
      .spyOn(nav, 'userLanguage', 'get')
      .mockReturnValue(properties.includes('userLanguage') ? 'some-third-locale' : undefined);
  }
});
