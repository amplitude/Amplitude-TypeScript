import { stubPlugin } from '../src/index';

describe('stub-browser', () => {
  it('should be defined', () => {
    expect(stubPlugin).toBeDefined();
  });
  it('should call setup and teardown without errors', async () => {
    const plugin = stubPlugin();
    /* eslint-disable-next-line @typescript-eslint/no-unsafe-argument */
    await plugin?.setup?.({} as unknown as any, {} as unknown as any);
    await plugin?.teardown?.();
  });
});
