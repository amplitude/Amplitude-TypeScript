/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { Config, LogLevel, LogConfig } from '@amplitude/analytics-types';
import { AmplitudeCore } from '../core-client';

export const getStacktrace = (ignoreDepth = 0): string => {
  const trace = new Error().stack || '';
  return trace
    .split('\n')
    .slice(2 + ignoreDepth)
    .map((text) => text.trim())
    .join('\n');
};

// This hook makes sure we always get the latest logger and logLevel.
export const getClientLogConfig = (client: AmplitudeCore<Config>) => (): LogConfig => {
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

export const getClientStates = (client: AmplitudeCore<Config>, paths: Array<string>) => (): { [key: string]: any } => {
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
    const logs: string[] = [];
    logs.push(`start time: ${new Date().toISOString()}`);
    logs.push(`function name "${fnName}" called with args: ${JSON.stringify(args, null, 2)}`);
    if (getStates) {
      logs.push(`states before execution ${JSON.stringify(getStates(), null, 2)}`);
    }
    logs.push(`function stacktrace: ${getStacktrace(1)}`);
    const result = fn.apply(fnContext, args);
    if (result && (result as any).promise) {
      // if result is a promise, add the callback
      (result as any).promise.then(() => {
        if (getStates) {
          logs.push(`states after execution ${JSON.stringify(getStates(), null, 2)}`);
        }
        logs.push(`end time: ${new Date().toISOString()}`);
        for (const log of logs) {
          logger.debug(log);
        }
      });
    } else {
      if (getStates) {
        logs.push(`states after execution ${JSON.stringify(getStates(), null, 2)}`);
      }
      logs.push(`end time: ${new Date().toISOString()}`);
      for (const log of logs) {
        logger.debug(log);
      }
    }
    return result;
  };
