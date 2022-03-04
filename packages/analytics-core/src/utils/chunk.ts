// Creates an array of elements split into groups the length of size.
// If array can't be split evenly, the final chunk will be the remaining elements.
// Works similary as https://lodash.com/docs/4.17.15#chunk

export const chunk = <T>(arr: T[], size: number) => {
  const chunkSize = Math.max(size, 1);
  return arr.reduce<T[][]>((chunks, element, index) => {
    const chunkIndex = Math.floor(index / chunkSize);
    if (!chunks[chunkIndex]) {
      chunks[chunkIndex] = [];
    }
    chunks[chunkIndex].push(element);
    return chunks;
  }, []);
};
