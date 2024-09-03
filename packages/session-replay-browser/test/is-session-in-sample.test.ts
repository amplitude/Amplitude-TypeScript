import fs from 'node:fs';
import { generateHashCode, sampleRateFn } from '../src/helpers';

describe('isSessionInSample', () => {
  test('all', () => {
    const fileData = fs.readFileSync('/Users/lew.gordon/Downloads/extract-2024-09-03T13_54_26.432Z.csv');
    const lines = fileData.toString('utf-8').split('\n');
    const newLines = [];
    for (const line of lines.slice(1)) {
      const sessionId = line.trim();
      newLines.push(`${sessionId},${generateHashCode(sessionId)},${sampleRateFn(Number(sessionId))}`);
    }
    console.log(newLines);
    fs.writeFileSync('/Users/lew.gordon/Downloads/output.csv', newLines.join('\n'));
    expect(true).toBe(true);
  });
});
