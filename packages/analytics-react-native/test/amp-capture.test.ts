import { ampCapture, EVENT_TYPE_VALUES, subscribe, type AmpCaptureProperties } from '../src/amp-capture';

describe('amp-capture', () => {
  const unsubscribers: Array<() => void> = [];

  afterEach(() => {
    unsubscribers.forEach((unsubscribe) => unsubscribe());
    unsubscribers.length = 0;
  });

  const addSubscriber = (callback: (properties: AmpCaptureProperties) => void) => {
    unsubscribers.push(subscribe(callback));
  };

  describe('EVENT_TYPE_VALUES', () => {
    test('exports supported event types', () => {
      expect(EVENT_TYPE_VALUES).toEqual({
        Press: 'Press',
        LongPress: 'LongPress',
        Change: 'Change',
      });
    });
  });

  describe('subscribe', () => {
    test('returns an unsubscribe function', () => {
      const unsubscribe = subscribe(jest.fn());
      expect(typeof unsubscribe).toBe('function');
      unsubscribe();
    });
  });

  describe('ampCapture', () => {
    const properties: AmpCaptureProperties = {
      event: EVENT_TYPE_VALUES.Press,
      accessibilityLabel: 'Submit',
      testID: 'submit-button',
    };

    test('notifies subscribers with properties when the wrapped function is called', () => {
      const callback = jest.fn();
      addSubscriber(callback);

      const wrapped = ampCapture(jest.fn(), properties);
      wrapped();

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(properties);
    });

    test('notifies all subscribers', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      addSubscriber(callback1);
      addSubscriber(callback2);

      ampCapture(jest.fn(), properties)();

      expect(callback1).toHaveBeenCalledWith(properties);
      expect(callback2).toHaveBeenCalledWith(properties);
    });

    test('stops notifying after unsubscribe', () => {
      const callback = jest.fn();
      const unsubscribe = subscribe(callback);

      ampCapture(jest.fn(), properties)();
      expect(callback).toHaveBeenCalledTimes(1);

      unsubscribe();
      ampCapture(jest.fn(), properties)();
      expect(callback).toHaveBeenCalledTimes(1);
    });

    test('passes arguments through to the original function', () => {
      const original = jest.fn();
      const wrapped = ampCapture(original, properties);

      wrapped('arg1', 42);

      expect(original).toHaveBeenCalledWith('arg1', 42);
    });

    test('returns the original function result', () => {
      const wrapped = ampCapture(() => 'result', properties);
      expect(wrapped()).toBe('result');
    });

    test('notifies subscribers before invoking the original function', () => {
      const order: string[] = [];
      addSubscriber(() => order.push('subscriber'));

      const wrapped = ampCapture(() => order.push('original'), properties);
      wrapped();

      expect(order).toEqual(['subscriber', 'original']);
    });
  });
});
