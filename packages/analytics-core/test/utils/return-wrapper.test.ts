import { returnWrapper } from '../../src/utils/return-wrapper';

describe('return-wrapper', () => {
  test('should undefined in promise interface', async () => {
    const value = await returnWrapper().promise;
    expect(value).toEqual(undefined);
  });

  test('should value in promise interface', async () => {
    const fn = async () => {
      return 1;
    };
    const value = await returnWrapper(fn()).promise;
    expect(value).toEqual(1);
  });
});
