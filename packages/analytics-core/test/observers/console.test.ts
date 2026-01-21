import { consoleObserver } from '../../src';

describe('consoleObserver', () => {
  beforeEach(() => {
    // add memory property to console prototype
    (globalThis.console as any).__proto__.memory = 12345;
  });

  afterEach(() => {
    consoleObserver._restoreConsole();
  });

  describe('addListener', () => {
    it('should call callback when console method is invoked', () => {
      const callback = jest.fn();
      consoleObserver.addListener('log', callback);
      console.log('test message');
      expect(callback).toHaveBeenCalledWith('log', ['test message']);
    });

    it('should support multiple callbacks for the same level', () => {
      const callback1 = jest.fn();
      consoleObserver.addListener('warn', callback1);
      const callback2 = jest.fn();
      consoleObserver.addListener('warn', callback2);

      console.warn('warning');

      expect(callback1).toHaveBeenCalledWith('warn', ['warning']);
      expect(callback2).toHaveBeenCalledWith('warn', ['warning']);
    });

    it('should not call callback when console method is not a function', () => {
      const callback = jest.fn();
      consoleObserver.addListener('memory' as keyof Console, callback);
      expect(typeof (globalThis.console as any).memory).toBe('number');
      expect(callback).not.toHaveBeenCalled();
    });

    it('should not call callback if console is inside of a callback override', () => {
      const callback = jest.fn(function () {
        console.log('RECURSION!');
      });
      consoleObserver.addListener('log', callback);
      console.log('test message');
      expect(callback).toHaveBeenCalledWith('log', ['test message']);
    });

    it('should not break if callback throws an exception', () => {
      const callback = jest.fn(function () {
        throw new Error('Exception in callback!');
      });
      consoleObserver.addListener('log', callback);
      console.log('test message');
      expect(callback).toHaveBeenCalledWith('log', ['test message']);
    });
  });

  describe('removeListener', () => {
    it('should stop calling callback after removeListener', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      consoleObserver.addListener('log', callback1);
      consoleObserver.addListener('log', callback2);

      console.log('before');
      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);

      consoleObserver.removeListener(callback1);

      console.log('after');
      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(2);

      consoleObserver.removeListener(callback2);

      console.log('after remove all listeners');
      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(2);
    });
  });
});
