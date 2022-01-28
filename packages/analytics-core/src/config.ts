export class Config {
  private static instance: Record<string, Config | undefined> = {};
  apiKey: string;
  userId?: string;

  private constructor(apiKey: string, userId?: string) {
    this.apiKey = apiKey;
    this.userId = userId;
  }

  static create(apiKey: string, userId?: string) {
    this.instance['default'] = new Config(apiKey, userId);
  }

  static get() {
    return this.instance['default'];
  }
}
