/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { LogLevel } from '@amplitude/analytics-types';
import {
  getStacktrace,
  getClientLogConfig,
  getValueByStringPath,
  getClientStates,
  debugWrapper,
} from '../../src/utils/debug';
import { returnWrapper } from '../../src/utils/return-wrapper';
import { AmplitudeCore } from '../../src/index';
import { useDefaultConfig } from '../helpers/default';

describe('debug', () => {
  describe('getStacktrace', () => {
    test('should get the stacktrace of a function call', () => {
      let stacktrace = '';
      const twoSum = (a: number, b: number): number => {
        stacktrace = getStacktrace();
        return a + b;
      };
      twoSum(1, 2);
      expect(stacktrace.includes('twoSum')).toBe(true);
    });

    test('should return empty string when Error is not available', () => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      global.Error = jest.fn();
      let stacktrace = '';
      const twoSum = (a: number, b: number): number => {
        stacktrace = getStacktrace();
        return a + b;
      };
      twoSum(1, 2);
      expect(stacktrace).toBe('');
    });
  });

  describe('getClientLogConfig', () => {
    test('should get client log config', async () => {
      const client = new AmplitudeCore();
      const defaultConfig = useDefaultConfig();
      await client._init(defaultConfig);
      const getLogConfig = getClientLogConfig(client);
      const logConfig = getLogConfig();
      expect(logConfig.logLevel).toEqual(defaultConfig.logLevel);
      expect(logConfig.logger).toEqual(defaultConfig.loggerProvider);
    });
  });

  describe('getValueByStringPath', () => {
    test('should get attribute with string path', () => {
      let obj: any = { a: 1 };
      expect(getValueByStringPath(obj, 'a')).toEqual(1);

      obj = { a: { b: 1 } };
      expect(getValueByStringPath(obj, 'a.b')).toEqual(1);

      obj = { a: { b: [1, 2] } };
      expect(getValueByStringPath(obj, 'a.b[1]')).toEqual(2);

      obj = { a: { b: 1 } };
      expect(getValueByStringPath(obj, 'a.c')).toEqual(undefined);
    });
  });

  describe('getClientStates', () => {
    test('should get client states', async () => {
      const client = new AmplitudeCore();
      const defaultConfig = useDefaultConfig();
      await client._init(defaultConfig);
      const getStates = getClientStates(client, ['config', 'timeline.queue']);
      const clientStates = getStates();
      expect(clientStates['config']).toEqual(defaultConfig);
      expect(clientStates['timeline.queue']).toEqual(client.timeline.queue);
    });
  });

  describe('debugWrapper', () => {
    let logger: any;

    beforeEach(() => {
      // init new logger to reset mock call times
      logger = {
        disable: jest.fn(),
        enable: jest.fn(),
        debug: jest.fn(),
        log: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      };
    });

    test('should not call debug when not reaching debug level', async () => {
      const fn = jest.fn<Promise<number>, []>().mockReturnValueOnce(Promise.resolve(1));
      const wrappedFn = debugWrapper(
        fn,
        'fn',
        () => ({
          logger,
          logLevel: LogLevel.Verbose,
        }),
        () => ({ state1: 1 }),
      );
      const result = await wrappedFn();
      expect(logger.debug).toHaveBeenCalledTimes(0);
      expect(result).toBe(1);
    });

    test('should not call debug when logger is missing', async () => {
      const fn = jest.fn<Promise<number>, []>().mockReturnValueOnce(Promise.resolve(1));
      const wrappedFn = debugWrapper(
        fn,
        'fn',
        () => ({
          logger: null as any,
          logLevel: LogLevel.Debug,
        }),
        () => ({ state1: 1 }),
      );
      const result = await wrappedFn();
      expect(logger.debug).toHaveBeenCalledTimes(0);
      expect(result).toBe(1);
    });

    test('should call debug when reaching debug level', async () => {
      const fn = jest.fn<Promise<number>, []>().mockReturnValueOnce(Promise.resolve(1));
      const wrappedFn = debugWrapper(
        fn,
        'fn',
        () => ({
          logger,
          logLevel: LogLevel.Debug,
        }),
        () => ({ state1: 1 }),
      );
      const result = await wrappedFn();
      expect(result).toBe(1);
      expect(logger.debug).toHaveBeenCalledTimes(6);
      const debugCallParams = logger.debug.mock.calls;
      expect(debugCallParams[0][0].includes('start time')).toEqual(true);
      expect(debugCallParams[1][0].includes('function name "fn"')).toEqual(true);
      expect(debugCallParams[2][0].includes('states')).toEqual(true);
      expect(debugCallParams[3][0].includes('function stacktrace')).toEqual(true);
      expect(debugCallParams[4][0].includes('states')).toEqual(true);
      expect(debugCallParams[5][0].includes('end time')).toEqual(true);
    });

    test('should work with returnWrapper', async () => {
      const fn = jest.fn<Promise<number>, []>().mockReturnValueOnce(Promise.resolve(1));
      const wrappedFn = debugWrapper(
        returnWrapper(fn),
        'fn',
        () => ({
          logger,
          logLevel: LogLevel.Debug,
        }),
        () => ({ state1: 1 }),
      );
      const result = await wrappedFn().promise;
      expect(result).toBe(1);
      expect(logger.debug).toHaveBeenCalledTimes(6);
    });
  });
});
