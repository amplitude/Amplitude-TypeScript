import { webVitalsPlugin } from '../src/index';

describe('web-vitals-browser', () => {
  it('should be defined', () => {
    expect(webVitalsPlugin).toBeDefined();
  });
  it('should call setup and teardown without errors', async () => {
    const plugin = webVitalsPlugin();
    /* eslint-disable-next-line @typescript-eslint/no-unsafe-argument */
    await plugin?.setup?.({} as unknown as any, {} as unknown as any);
    await plugin?.teardown?.();
  });
});
