import { consoleObserver } from '../../src/';

describe('consoleObserver', () => {
  beforeEach(() => {
    // add memory property to console prototype
    (globalThis.console as any).__proto__.memory = 12345;
  });
  
  afterEach(() => {
    consoleObserver._restoreConsole();
  });

  describe('observe', () => {
    it('should call callback when console method is invoked', () => {
      let callback = jest.fn();
      consoleObserver.observe('log', callback);
      console.log('test message');
      expect(callback).toHaveBeenCalledWith('log', ['test message']);
    });

    it('should support multiple callbacks for the same level', async () => {
      const callback1 = jest.fn();
      consoleObserver.observe('warn', callback1);
      const callback2 = jest.fn();
      consoleObserver.observe('warn', callback2);

      console.warn('warning');

      expect(callback1).toHaveBeenCalledWith('warn', ['warning']);
      expect(callback2).toHaveBeenCalledWith('warn', ['warning']);
    });

    it('should not call callback when console method is not a function', () => {
      const callback = jest.fn();
      consoleObserver.observe('memory' as keyof Console, callback);
      expect(typeof (globalThis.console as any).memory).toBe('number');
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('disconnect', () => {
    it('should stop calling callback after disconnect', async () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      consoleObserver.observe('log', callback1);
      consoleObserver.observe('log', callback2);

      console.log('before');
      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);

      consoleObserver.disconnectHandler(callback1);

      console.log('after');
      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(2);

      consoleObserver.disconnectHandler(callback2);

      console.log('after disconnect all');
      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(2);
    });
  });
});
