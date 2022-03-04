import { chunk } from '../../src/utils/chunk';

describe('chunk', () => {
  test('should split in chunks', () => {
    const arr = [1, 2, 3, 4, 5];
    expect(chunk(arr, 0)).toEqual([[1], [2], [3], [4], [5]]);
    expect(chunk(arr, 1)).toEqual([[1], [2], [3], [4], [5]]);
    expect(chunk(arr, 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk(arr, 3)).toEqual([
      [1, 2, 3],
      [4, 5],
    ]);
    expect(chunk(arr, 4)).toEqual([[1, 2, 3, 4], [5]]);
    expect(chunk(arr, 5)).toEqual([[1, 2, 3, 4, 5]]);
    expect(chunk(arr, 6)).toEqual([[1, 2, 3, 4, 5]]);
  });
});
