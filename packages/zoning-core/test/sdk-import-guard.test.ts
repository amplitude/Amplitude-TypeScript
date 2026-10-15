import fs from 'fs';
import path from 'path';

const PACKAGES_DIR = path.join(__dirname, '../../..', 'packages');
const FORBIDDEN = '@amplitude/zoning-core';

describe('SDK import guard', () => {
  it('no package other than zoning-core imports @amplitude/zoning-core', () => {
    const offenders: string[] = [];
    const packageNames = fs.readdirSync(PACKAGES_DIR);

    for (const packageName of packageNames) {
      if (packageName === 'zoning-core') {
        continue;
      }
      const srcDir = path.join(PACKAGES_DIR, packageName, 'src');
      if (!fs.existsSync(srcDir)) {
        continue;
      }
      walkTsFiles(srcDir, (filePath) => {
        const contents = fs.readFileSync(filePath, 'utf8');
        if (contents.includes(FORBIDDEN)) {
          offenders.push(filePath);
        }
      });
    }

    expect(offenders).toEqual([]);
  });
});

function walkTsFiles(dir: string, visit: (filePath: string) => void): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkTsFiles(fullPath, visit);
    } else if (entry.name.endsWith('.ts')) {
      visit(fullPath);
    }
  }
}
