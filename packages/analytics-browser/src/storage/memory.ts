import { Storage } from '@amplitude/analytics-types';

export class MemoryStorage implements Storage {
  memoryStorage: Map<string, any> = new Map();

  isEnabled(): boolean {
    return true;
  }

  get(key: string): any {
    return this.memoryStorage.get(key) ?? null;
  }

  set(key: string, value: string) {
    this.memoryStorage.set(key, value);
  }

  remove(key: string) {
    this.memoryStorage.delete(key);
  }

  reset() {
    this.memoryStorage.clear();
  }
}
