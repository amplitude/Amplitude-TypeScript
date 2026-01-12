import { getGlobalScope } from '../global-scope';

type ConsoleLogLevel = keyof Console;

const globalScope = getGlobalScope();
/* istanbul ignore next */
const originalConsole: Console | undefined = globalScope?.console;
const isProxySupported = typeof Proxy === 'function';
const isMapSupported = typeof Map === 'function';
const isSupported = isProxySupported && isMapSupported;

let isOverridden = false;

type Callback = (logLevel: ConsoleLogLevel, args: any[]) => void;

const handlers = isMapSupported ? new Map<ConsoleLogLevel, Array<Callback>>() : undefined;

let inConsoleOverride = false;

function overrideConsole(): boolean {
  /* istanbul ignore if */
  if (!originalConsole || !globalScope || !isSupported) {
    return false;
  }

  // if console is already overridden, return true
  if (isOverridden) {
    return true;
  }

  // use Proxy to override the console method
  const handler = {
    // get args from console method call
    get(target: Console, prop: ConsoleLogLevel) {
      if (typeof target[prop] !== 'function') {
        return target[prop];
      }
      return function (...args: any[]) {
        try {
          // add a re-entrancy guard to prevent infinite recursion
          if (handlers.has(prop) && !inConsoleOverride) {
            inConsoleOverride = true;
            const callbacks = handlers.get(prop);
            if (callbacks) {
              callbacks.forEach((callback) => {
                try {
                  callback(prop, args);
                } catch {
                  // do nothing
                }
              });
            }
            inConsoleOverride = false;
          }
        } catch {
          // do nothing
        }
        /* eslint-disable-next-line @typescript-eslint/no-unsafe-argument */
        return Reflect.apply(target[prop] as (...args: any[]) => void, target, args);
      };
    },
  };
  globalScope.console = new Proxy(originalConsole, handler);
  isOverridden = true;
  return true;
}

/**
 * Observe a console log method (log, warn, error, etc.)
 * @param level - The console log level to observe
 * @param callback - The callback function to call when the console log level is observed
 */
function addListener(level: ConsoleLogLevel, callback: Callback): Error | void {
  const res = overrideConsole();

  /* istanbul ignore if */
  if (!res) {
    return new Error('Console override failed');
  }

  if (handlers.has(level)) {
    // using ! is safe because we know the key exists based on has() condition
    handlers.get(level)!.push(callback);
  } else {
    handlers.set(level, [callback]);
  }
}

/**
 * Disconnect a callback function from a console log method
 * @param callback - The callback function to disconnect
 */
function removeListener(callback: Callback) {
  handlers.forEach((callbacks) => {
    if (callbacks.includes(callback)) {
      callbacks.splice(callbacks.indexOf(callback), 1);
    }
  });
}

// this should only be used for testing
// restoring console can break other console overrides
function _restoreConsole() {
  if (globalScope && originalConsole) {
    /* eslint-disable-next-line @typescript-eslint/no-unsafe-member-access */
    (globalScope as any).console = originalConsole;
  }
  isOverridden = false;
  handlers.clear();
}

const consoleObserver = {
  addListener,
  removeListener,
  _restoreConsole,
};

export { consoleObserver, ConsoleLogLevel };
