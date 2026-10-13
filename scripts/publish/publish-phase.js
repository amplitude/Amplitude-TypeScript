const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const pluginName = '@amplitude/plugin-custom-enrichment-browser';
const dependencyFields = ['dependencies', 'optionalDependencies', 'peerDependencies'];

function getReleaseGroups(packagesDir) {
  const packages = fs
    .readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(packagesDir, entry.name, 'package.json'))
    .filter((file) => fs.existsSync(file))
    .map((file) => JSON.parse(fs.readFileSync(file, 'utf8')));
  const dependents = new Set([pluginName]);

  // A package must wait if it directly or transitively needs the staged plugin.
  let changed = true;
  while (changed) {
    changed = false;
    for (const pkg of packages) {
      if (dependents.has(pkg.name)) continue;
      const dependencies = dependencyFields.flatMap((field) => Object.keys(pkg[field] || {}));
      if (dependencies.some((name) => dependents.has(name))) {
        dependents.add(pkg.name);
        changed = true;
      }
    }
  }

  const publicPackages = packages.filter((pkg) => !pkg.private && pkg.name !== pluginName);
  return {
    independent: publicPackages
      .filter((pkg) => !dependents.has(pkg.name))
      .map((pkg) => pkg.name)
      .sort(),
    dependent: publicPackages
      .filter((pkg) => dependents.has(pkg.name))
      .map((pkg) => pkg.name)
      .sort(),
  };
}

if (require.main === module) {
  const phase = process.argv[2];
  if (!['independent', 'dependent'].includes(phase)) {
    console.error('Usage: node scripts/publish/publish-phase.js <independent|dependent> [pnpm publish options]');
    process.exit(2);
  }
  const groups = getReleaseGroups(path.resolve(__dirname, '../../packages'));
  const names = groups[phase];
  console.log(`${phase} packages: ${names.join(', ') || '(none)'}`);
  if (names.length > 0) {
    const args = [
      '-r',
      ...names.flatMap((name) => ['--filter', name]),
      'publish',
      '--no-git-checks',
      ...process.argv.slice(3),
    ];
    const result = spawnSync('pnpm', args, { stdio: 'inherit' });
    if (result.error) throw result.error;
    process.exit(result.status ?? 1);
  }
}

module.exports = { getReleaseGroups };
