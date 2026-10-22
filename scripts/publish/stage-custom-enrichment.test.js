const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const script = path.resolve(__dirname, 'stage-custom-enrichment.sh');

for (const published of [false, true]) {
  test(`staging preserves the source manifest (already published: ${published})`, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'enrichment-stage-'));
    try {
      const packageDir = path.join(root, 'packages/plugin-custom-enrichment-browser');
      fs.mkdirSync(packageDir, { recursive: true });
      const manifest = {
        name: '@amplitude/plugin-custom-enrichment-browser',
        version: '1.0.0',
        private: true,
        contentPolicy: { class: 'dual-use' },
        dependencies: { tslib: '^2.4.1' },
        peerDependencies: { '@amplitude/analytics-core': '^2.61.0' },
        devDependencies: { '@amplitude/analytics-core': '2.61.0' },
      };
      fs.writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify(manifest));
      fs.mkdirSync(path.join(root, 'bin'));
      // Mock registry and staging only: exercise the real shell script and tar extraction.
      fs.writeFileSync(
        path.join(root, 'bin/pnpm'),
        `#!/usr/bin/env node
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const args = process.argv.slice(2);
if (args[0] === 'view') {
  console.log(JSON.stringify(${published ? "['1.0.0']" : '[]'}));
} else if (args[0] === '--dir') {
  const dest = args[args.indexOf('--pack-destination') + 1];
  fs.mkdirSync(dest + '/package');
  fs.copyFileSync(args[1] + '/package.json', dest + '/package/package.json');
  execFileSync('tar', ['-czf', dest + '/plugin.tgz', '-C', dest, 'package']);
} else if (args[0] === 'stage' && args[1] === 'publish') {
  fs.copyFileSync(args[2] + '/package.json', 'staged.json');
  fs.writeFileSync('stage-args.json', JSON.stringify(args));
} else { process.exit(99); }
`,
        { mode: 0o755 },
      );
      execFileSync('bash', [script], {
        cwd: root,
        env: { ...process.env, PATH: `${root}/bin:${process.env.PATH}`, GITHUB_OUTPUT: `${root}/output` },
      });
      assert.deepEqual(JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'))), manifest);
      const output = fs.readFileSync(path.join(root, 'output'), 'utf8');
      assert.match(output, /version=1.0.0/);
      assert.match(output, new RegExp(`required=${!published}`));
      if (published) {
        assert.equal(fs.existsSync(path.join(root, 'staged.json')), false);
      } else {
        const staged = JSON.parse(fs.readFileSync(path.join(root, 'staged.json')));
        const { private: ignored, ...expected } = manifest;
        assert.deepEqual(staged, expected);
        const args = JSON.parse(fs.readFileSync(path.join(root, 'stage-args.json')));
        assert.ok(args.includes('--provenance'));
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}
