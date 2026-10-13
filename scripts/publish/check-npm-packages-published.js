const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const packagesDir = path.resolve(__dirname, '../../packages');
const firstPublishGuide = 'CONTRIBUTING.md#publishing-npm-package-for-the-first-time';

const packageJsonPaths = fs
  .readdirSync(packagesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(packagesDir, entry.name, 'package.json'))
  .filter((packageJsonPath) => fs.existsSync(packageJsonPath));

const unpublishedPackages = [];

for (const packageJsonPath of packageJsonPaths) {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

  if (packageJson.private) {
    continue;
  }

  try {
    const version = execFileSync('pnpm', ['view', packageJson.name, 'version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    const versionMessage = version ? ` (${version})` : '';
    console.log(`${packageJson.name} is already published${versionMessage}`);
  } catch (error) {
    unpublishedPackages.push(packageJson.name);
  }
}

if (unpublishedPackages.length > 0) {
  console.error('The following public packages have not been published to npm yet:');
  for (const packageName of unpublishedPackages) {
    console.error(`- ${packageName}`);
  }
  console.error('');
  console.error(
    'These packages cannot be published by the workflow until they have been bootstrapped in npm.',
  );
  console.error(
    `Follow the "Publishing NPM package for the first time" guide in ${firstPublishGuide} before retrying this workflow.`,
  );
  process.exit(1);
}

console.log('All public packages have already been published to npm.');
