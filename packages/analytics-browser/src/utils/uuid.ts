/**
 * Source: [jed's gist]{@link https://gist.github.com/982883}.
 * Returns a random v4 UUID of the form xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx,
 * where each x is replaced with a random hexadecimal digit from 0 to f, and
 * y is replaced with a random hexadecimal digit from 8 to b.
 * Used to generate UUIDs for deviceIds.
 * @private
 */
export const UUID = function (a?: any): string {
  return a // if the placeholder was passed, return
    ? // a random number from 0 to 15
      (
        a ^ // unless b is 8,
        ((Math.random() * // in which case
          16) >> // a random number from
          (a / 4))
      ) // 8 to 11
        .toString(16) // in hexadecimal
    : // or otherwise a concatenated string:
      (
        String(1e7) + // 10000000 +
        String(-1e3) + // -1000 +
        String(-4e3) + // -4000 +
        String(-8e3) + // -80000000 +
        String(-1e11)
      ) // -100000000000,
        .replace(
          // replacing
          /[018]/g, // zeroes, ones, and eights with
          UUID, // random hex digits
        );
};
