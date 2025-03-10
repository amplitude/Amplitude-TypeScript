/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { LogConfig, DebugContext } from '../logger';
import { LogLevel } from '../types/loglevel';
import { AmplitudeCore } from '../core-client';

export const getStacktrace = (ignoreDepth = 0): string[] => {
  const trace = new Error().stack || '';
  return trace
    .split('\n')
    .slice(2 + ignoreDepth)
    .map((text) => text.trim());
};

// This hook makes sure we always get the latest logger and logLevel.
export const getClientLogConfig = (client: AmplitudeCore) => (): LogConfig => {
  const { loggerProvider: logger, logLevel } = { ...client.config };
  return {
    logger,
    logLevel,
  };
};

// This is a convenient function to get the attribute from object with string path, similar to lodash '#get'.
export const getValueByStringPath = (obj: any, path: string): any => {
  path = path.replace(/\[(\w+)\]/g, '.$1'); // convert indexes to properties
  path = path.replace(/^\./, ''); // strip a leading dot
  for (const attr of path.split('.')) {
    if (attr in obj) {
      obj = obj[attr];
    } else {
      return;
    }
  }
  return obj;
};

export const getClientStates = (client: AmplitudeCore, paths: Array<string>) => (): { [key: string]: any } => {
  const res: { [key: string]: any } = {};
  for (const path of paths) {
    res[path] = getValueByStringPath(client, path);
  }
  return res;
};

export const debugWrapper =
  <T extends Array<any>, R>(
    fn: (...args: T) => R,
    fnName: string,
    getLogConfig: () => LogConfig,
    getStates?: () => { [key: string]: any },
    fnContext: any = null,
  ) =>
  (...args: T): R => {
    const { logger, logLevel } = getLogConfig();
    // return early if possible to reduce overhead
    if ((logLevel && logLevel < LogLevel.Debug) || !logLevel || !logger) {
      return fn.apply(fnContext, args);
    }
    const debugContext: DebugContext = {
      type: 'invoke public method',
      name: fnName,
      args,
      stacktrace: getStacktrace(1),
      time: {
        start: new Date().toISOString(),
      },
      states: {},
    };
    if (getStates && debugContext.states) {
      debugContext.states.before = getStates();
    }
    const result = fn.apply(fnContext, args);
    if (result && (result as any).promise) {
      // if result is a promise, add the callback
      (result as any).promise.then(() => {
        if (getStates && debugContext.states) {
          debugContext.states.after = getStates();
        }
        if (debugContext.time) {
          debugContext.time.end = new Date().toISOString();
        }
        logger.debug(JSON.stringify(debugContext, null, 2));
      });
    } else {
      if (getStates && debugContext.states) {
        debugContext.states.after = getStates();
      }
      if (debugContext.time) {
        debugContext.time.end = new Date().toISOString();
      }
      logger.debug(JSON.stringify(debugContext, null, 2));
    }
    return result;
  };
