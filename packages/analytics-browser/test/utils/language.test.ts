import { getLanguage } from '../../src/utils/language';

declare global {
  interface Navigator {
    userLanguage: string;
  }
}

if (!('userLanguage' in navigator)) {
  Object.defineProperty(navigator, 'userLanguage', {
    get: () => '',
    configurable: true,
    enumerable: true,
  });
}

describe('language', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
});

function enableNavigatorLanguageProperties(properties: Array<'languages' | 'language' | 'userLanguage'>) {
  jest
    .spyOn(navigator, 'languages', 'get')
    .mockReturnValue(properties.includes('languages') ? ['some-locale', 'some-other-locale'] : []);
  jest.spyOn(navigator, 'language', 'get').mockReturnValue(properties.includes('language') ? 'some-second-locale' : '');
  jest
    .spyOn(navigator, 'userLanguage', 'get')
    .mockReturnValue(properties.includes('userLanguage') ? 'some-third-locale' : '');
}
