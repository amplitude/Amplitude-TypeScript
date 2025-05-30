import { frustrationPlugin } from '../src/index';

describe('frustration-browser', () => {
  it('should be defined', () => {
    expect(frustrationPlugin).toBeDefined();
  });
  it('should call setup and teardown without errors', async () => {
    const plugin = frustrationPlugin();
    /* eslint-disable-next-line @typescript-eslint/no-unsafe-argument */
    await plugin?.setup?.({} as unknown as any, {} as unknown as any);
    await plugin?.teardown?.();
  });
});
