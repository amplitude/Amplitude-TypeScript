import { getGlobalScope } from '../global-scope';

type ConsoleLogLevel = keyof Console;

const globalScope = getGlobalScope();
/* istanbul ignore next */
const originalConsole: Console | undefined = globalScope?.console;
let isOverridden = false;

type Callback = (logLevel: ConsoleLogLevel, args: any[]) => void;

const handlers = new Map<ConsoleLogLevel, Array<Callback>>();

function overrideConsole() {
  /* istanbul ignore if */
  if (isOverridden || !originalConsole || !globalScope) return;

  // use Proxy to override the console method
  const handler = {
    // get args from console method call
    get(target: Console, prop: ConsoleLogLevel) {
      if (typeof target[prop] !== 'function') {
        return target[prop];
      }
      return function (...args: any[]) {
        if (handlers.has(prop)) {
          const callbacks = handlers.get(prop);
          if (callbacks) {
            callbacks.forEach((callback) => callback(prop, args));
          }
        }
        /* eslint-disable-next-line @typescript-eslint/no-unsafe-argument */
        return (target[prop] as (...args: any[]) => void)(...args);
      };
    },
  };
  const proxy = new Proxy(originalConsole, handler);
  globalScope.console = proxy;
  isOverridden = true;
}

/**
 * Observe a console log method (log, warn, error, etc.)
 * @param level - The console log level to observe
 * @param callback - The callback function to call when the console log level is observed
 */
function observe(level: ConsoleLogLevel, callback: Callback) {
  if (handlers.has(level)) {
    // using ! is safe because we know the key exists based on has() condition
    handlers.get(level)!.push(callback);
  } else {
    handlers.set(level, [callback]);
  }
  overrideConsole();
}

/**
 * Disconnect a callback function from a console log method
 * @param callback - The callback function to disconnect
 */
function disconnectHandler(callback: Callback) {
  handlers.forEach((callbacks) => {
    if (callbacks.includes(callback)) {
      callbacks.splice(callbacks.indexOf(callback), 1);
    }
  });
}

// this should only be used for testing
// restoring console can break other console overrides
function _restoreConsole() {
  if (globalScope) {
    /* eslint-disable-next-line @typescript-eslint/no-unsafe-member-access */
    (globalScope as any).console = originalConsole;
  }
  isOverridden = false;
  handlers.clear();
}

const consoleObserver = {
  observe,
  disconnectHandler,
  _restoreConsole,
};

export { consoleObserver, ConsoleLogLevel };
