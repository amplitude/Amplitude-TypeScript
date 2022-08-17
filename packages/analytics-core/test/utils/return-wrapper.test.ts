import { returnWrapper } from '../../src/utils/return-wrapper';

describe('return-wrapper', () => {
  test('should wrap with amplitude return wrapper', async () => {
    const fn = jest.fn<Promise<number>, []>().mockReturnValueOnce(Promise.resolve(1));
    const wrappedFn = returnWrapper(fn);
    const result = await wrappedFn().promise;
    expect(result).toBe(1);
  });
});
