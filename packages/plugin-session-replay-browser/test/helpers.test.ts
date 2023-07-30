import { UNMASK_TEXT_CLASS } from '../src/constants';
import { maskInputFn } from '../src/helpers';

describe('SessionReplayPlugin helpers', () => {
  describe('maskInputFn', () => {
    test('should not mask an element whose class list has amp-unmask in it', () => {
      const htmlElement = document.createElement('div');
      htmlElement.classList.add(UNMASK_TEXT_CLASS);
      const result = maskInputFn('some text', htmlElement);
      expect(result).toEqual('some text');
    });
    test('should mask any other element', () => {
      const htmlElement = document.createElement('div');
      htmlElement.classList.add('another-class');
      const result = maskInputFn('some text', htmlElement);
      expect(result).toEqual('*********');
    });
    test('should handle an element without a class list', () => {
      const htmlElement = {} as unknown as HTMLElement;
      const result = maskInputFn('some text', htmlElement);
      expect(result).toEqual('*********');
    });
  });
});
