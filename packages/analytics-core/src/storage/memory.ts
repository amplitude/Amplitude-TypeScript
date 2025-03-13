import { Storage } from '../types/storage';

export class MemoryStorage<T> implements Storage<T> {
  memoryStorage: Map<string, T> = new Map();

  async isEnabled(): Promise<boolean> {
    return true;
  }

  async get(key: string): Promise<T | undefined> {
    return this.memoryStorage.get(key);
  }

  async getRaw(key: string): Promise<string | undefined> {
    const value = await this.get(key);
    return value ? JSON.stringify(value) : undefined;
  }

  async set(key: string, value: T): Promise<void> {
    this.memoryStorage.set(key, value);
  }

  async remove(key: string): Promise<void> {
    this.memoryStorage.delete(key);
  }

  async reset(): Promise<void> {
    this.memoryStorage.clear();
  }
}
