import { PrivacyConfig } from '../src/config/types';
import { MASK_TEXT_CLASS, UNMASK_TEXT_CLASS } from '../src/constants';
import { generateHashCode, isSessionInSample, maskFn } from '../src/helpers';

describe('SessionReplayPlugin helpers', () => {
  describe('maskFn -- input', () => {
    test('should default to medium on unknown mask level', () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const result = maskFn('input', { defaultMaskLevel: 'lightxx' } as any)('some text', null);
      expect(result).toEqual('**** ****');
    });

    test('should not mask on null element', () => {
      const result = maskFn('input', { defaultMaskLevel: 'light' })('some text', null);
      expect(result).toEqual('some text');
    });

    test('masking takes priority over code unmask', () => {
      const htmlElement = document.createElement('input');
      htmlElement.classList.add(UNMASK_TEXT_CLASS);
      const result = maskFn('input', { maskSelector: ['.' + UNMASK_TEXT_CLASS], unmaskSelector: [] })(
        'some text',
        htmlElement,
      );
      expect(result).toEqual('**** ****');
    });
    test('should mask on default config', () => {
      const htmlElement = document.createElement('div');
      const result = maskFn('input', { maskSelector: [], unmaskSelector: [] })('some text', htmlElement);
      expect(result).toEqual('**** ****');
    });
    test('should mask instead of unmask for certain selectors', () => {
      const htmlElement = document.createElement('div');
      htmlElement.classList.add('mask-this');
      const result = maskFn('input', {
        defaultMaskLevel: 'light',
        maskSelector: ['.mask-this'],
        unmaskSelector: ['.mask-this'],
      })('some text', htmlElement);
      expect(result).toEqual('**** ****');
    });
    test('should specifically mask certain selectors', () => {
      const htmlElement = document.createElement('div');
      htmlElement.classList.add('mask-this');
      const result = maskFn('input', { defaultMaskLevel: 'light', maskSelector: ['.mask-this'] })(
        'some text',
        htmlElement,
      );
      expect(result).toEqual('**** ****');
    });
    test('should specifically unmask certain selectors', () => {
      const htmlElement = document.createElement('div');
      htmlElement.classList.add('unmask-this');
      const result = maskFn('input', { defaultMaskLevel: 'conservative', unmaskSelector: ['.unmask-this'] })(
        'some text',
        htmlElement,
      );
      expect(result).toEqual('some text');
    });
    test('should not mask an element whose class list has amp-unmask in it', () => {
      const htmlElement = document.createElement('div');
      htmlElement.classList.add(UNMASK_TEXT_CLASS);
      const result = maskFn('input')('some text', htmlElement);
      expect(result).toEqual('some text');
    });
    test('should mask any other element', () => {
      const htmlElement = document.createElement('div');
      htmlElement.classList.add('another-class');
      const result = maskFn('input')('some text', htmlElement);
      expect(result).toEqual('**** ****');
    });
    test('should mask on conservative level', () => {
      const htmlElement = document.createElement('input');
      const result = maskFn('input', { defaultMaskLevel: 'conservative' })('some text', htmlElement);
      expect(result).toEqual('**** ****');
    });

    describe('light mask level', () => {
      const privacyConfig: PrivacyConfig = { defaultMaskLevel: 'light' };

      test.each([
        {
          el: (element: HTMLInputElement): HTMLInputElement => {
            element.type = 'password';
            return element;
          },
          masked: true,
        },
        {
          el: (element: HTMLInputElement): HTMLInputElement => {
            element.type = 'email';
            return element;
          },
          masked: true,
        },
        {
          el: (element: HTMLInputElement): HTMLInputElement => {
            element.type = 'hidden';
            return element;
          },
          masked: true,
        },
        {
          el: (element: HTMLInputElement): HTMLInputElement => {
            element.autocomplete = 'cc-number';
            return element;
          },
          masked: true,
        },
        {
          el: (element: HTMLInputElement): HTMLInputElement => {
            element.type = 'tel';
            return element;
          },
          masked: true,
        },
        {
          el: (element: HTMLInputElement): HTMLInputElement => {
            element.type = 'search';
            return element;
          },
          masked: false,
        },
        {
          el: (element: HTMLElement): HTMLElement => {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            (element as any).autocomplete = undefined; // we are given an HTMLElement so this is a edge case safety check
            return element;
          },
          masked: false,
        },
        {
          el: (element: HTMLElement): HTMLElement => {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            (element as any).type = null; // we are given an HTMLElement so this is a edge case safety check
            return element;
          },
          masked: false,
        },
      ])('check masked', ({ el, masked }) => {
        const inputElement = document.createElement('input');
        const result = maskFn('input', privacyConfig)('some text', el(inputElement));
        expect(result).toStrictEqual(masked ? '**** ****' : 'some text');
      });
    });
  });

  describe('maskFn -- text', () => {
    test('should mask on amp mask', () => {
      const htmlElement = document.createElement('text');
      htmlElement.classList.add(MASK_TEXT_CLASS);
      const result = maskFn('text')('some text', htmlElement);
      expect(result).toEqual('**** ****');
    });
    test('should mask on conservative level', () => {
      const htmlElement = document.createElement('text');
      const result = maskFn('text', { defaultMaskLevel: 'conservative' })('some text', htmlElement);
      expect(result).toEqual('**** ****');
    });
    // this will never happen in reality since rrweb will not call this
    // function if we had not registered selectors
    test('should mask an element on light mask level', () => {
      const htmlElement = document.createElement('div');
      const result = maskFn('text', { defaultMaskLevel: 'light' })('some text', htmlElement);
      expect(result).toEqual('**** ****');
    });
    test('should not mask an element whose class list has amp-unmask in it', () => {
      const htmlElement = document.createElement('div');
      htmlElement.classList.add(UNMASK_TEXT_CLASS);
      const result = maskFn('text')('some text', htmlElement);
      expect(result).toEqual('some text');
    });
  });

  describe('generateHashCode', () => {
    test('should return 0 if string length is 0', () => {
      const hashCode = generateHashCode('');
      expect(hashCode).toEqual(0);
    });
    test('should return hash for numeric string', () => {
      const hashCode = generateHashCode('1691093770366');
      expect(hashCode).toEqual(139812688);
    });
    test('should return hash for alphabetic string', () => {
      const hashCode = generateHashCode('my_session_identifier');
      expect(hashCode).toEqual(989939557);
    });
  });

  describe('isSessionInSample', () => {
    test('should deterministically return true if calculation puts session id below sample rate', () => {
      const result = isSessionInSample(1691092433788, 0.56);
      expect(result).toEqual(true);
    });
    test('should deterministically return false if calculation puts session id above sample rate', () => {
      const result = isSessionInSample(1691092416403, 0.13);
      expect(result).toEqual(false);
    });
  });
});
