import { getGlobalScope } from '../global-scope';

type ConsoleLogLevel = keyof Console;

const globalScope = getGlobalScope();
/* istanbul ignore next */
const originalConsole: Console | undefined = globalScope?.console;
const isProxySupported = typeof Proxy === 'function';
const isMapSupported = typeof Map === 'function';
const isSupported = isProxySupported && isMapSupported;

type Callback = (logLevel: ConsoleLogLevel, args: any[]) => void;

const handlers = new Map<ConsoleLogLevel, Array<Callback>>();
let originalFn: { [key in ConsoleLogLevel]?: (...args: any[]) => void } = {};

let inConsoleOverride = false;

function overrideConsole(logLevel: ConsoleLogLevel): boolean {
  /* istanbul ignore if */
  if (!originalConsole || !globalScope || !isSupported) {
    return false;
  }

  // should not override if original console property is not a function
  if (typeof originalConsole[logLevel] !== 'function') {
    return false;
  }

  // if console is already overridden, return true
  if (originalFn[logLevel]) {
    return true;
  }

  // override console method
  const handler = function (...args: any[]) {
    try {
      if (handlers.has(logLevel) && !inConsoleOverride) {
        // add a re-entrancy guard to prevent infinite recursion
        inConsoleOverride = true;
        const callbacks = handlers.get(logLevel);
        if (callbacks) {
          callbacks.forEach((callback) => {
            try {
              callback(logLevel, args);
            } catch {
              // do nothing
            }
          });
        }
      }
    } catch {
      // do nothing
    }
    inConsoleOverride = false;
    return originalFn[logLevel]!.apply(originalConsole, args);
  };
  originalFn[logLevel] = originalConsole[logLevel] as (...args: any[]) => void;
  /* eslint-disable-next-line @typescript-eslint/no-unsafe-member-access */
  (globalScope.console as any)[logLevel] = handler;
  return true;
}

/**
 * Observe a console log method (log, warn, error, etc.)
 * @param level - The console log level to observe
 * @param callback - The callback function to call when the console log level is observed
 */
function addListener(level: ConsoleLogLevel, callback: Callback): Error | void {
  const res = overrideConsole(level);

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
    // iterate backwards to avoid index shifting
    for (let i = callbacks.length - 1; i >= 0; i--) {
      if (callbacks[i] === callback) {
        callbacks.splice(i, 1);
        break;
      }
    }
  });
}

// this should only be used for testing
// restoring console can break console overrides
function _restoreConsole() {
  for (const [key, originalHandler] of Object.entries(originalFn)) {
    if (originalHandler) {
      /* eslint-disable-next-line @typescript-eslint/no-unsafe-member-access */
      (originalConsole as any)[key] = originalHandler;
    }
  }
  originalFn = {};
  handlers.clear();
}

const consoleObserver = {
  addListener,
  removeListener,
  _restoreConsole,
};

export { consoleObserver, ConsoleLogLevel };
