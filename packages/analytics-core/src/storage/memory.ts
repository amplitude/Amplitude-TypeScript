import { Storage } from '@amplitude/analytics-types';

export class MemoryStorage<T> implements Storage<T> {
  memoryStorage: Map<string, T> = new Map();

  isEnabled(): boolean {
    return true;
  }

  get(key: string): T | undefined {
    return this.memoryStorage.get(key);
  }

  getRaw(key: string) {
    const value = this.get(key);
    return value ? JSON.stringify(value) : undefined;
  }

  set(key: string, value: T) {
    this.memoryStorage.set(key, value);
  }

  remove(key: string) {
    this.memoryStorage.delete(key);
  }

  reset() {
    this.memoryStorage.clear();
  }
}
