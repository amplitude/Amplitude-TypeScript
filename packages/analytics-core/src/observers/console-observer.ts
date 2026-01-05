import { getGlobalScope } from '../global-scope';

const globalScope = getGlobalScope();

export class ConsoleObserver {
  private errorObservers: ((errorMessage: string) => void)[] = [];
  constructor() {
  }

  static isSupported(): boolean {
    return typeof Proxy !== 'undefined' && !!globalScope;
  }

  observeError(onError: (errorMessage: string) => void) {
    if (this.errorObservers.length === 0) {
    //   const originalConsole = globalScope?.console;
    //   if (!originalConsole) return;
    //   globalScope.console = new Proxy(originalConsole, {
    //     get: (target, prop) => {
    //       return (...args: any[]) => {
    //         target[prop](...args);
    //         this.errorObservers.forEach(observer => observer(args[0]));
    //         Reflect.apply(target[prop], target, args);
    //       };
    //     },
    //   });
    }
    this.errorObservers.push(onError);
  }
}

export const consoleObserver = ConsoleObserver.isSupported() ?
  new ConsoleObserver() :
  null;