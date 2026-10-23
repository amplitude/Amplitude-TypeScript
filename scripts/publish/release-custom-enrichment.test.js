const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { versionSection } = require('./release-custom-enrichment');

const script = path.resolve(__dirname, 'release-custom-enrichment.js');
const packageName = '@amplitude/plugin-custom-enrichment-browser';
const packageDir = 'packages/plugin-custom-enrichment-browser';
const tag = `${packageName}@1.0.0`;

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'enrichment-release-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const cwd = path.join(root, 'repo');
  const remote = path.join(root, 'remote.git');
  const state = path.join(root, 'github.json');
  fs.mkdirSync(cwd);
  const git = (...args) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  execFileSync('git', ['init', '--bare', remote], { stdio: 'pipe' });
  git('init', '-b', 'main');
  git('config', 'user.name', 'Test');
  git('config', 'user.email', 'test@example.com');
  git('config', 'core.hooksPath', '/dev/null');
  git('remote', 'add', 'origin', remote);
  fs.mkdirSync(path.join(cwd, packageDir), { recursive: true });
  const manifest = { name: packageName, version: '1.0.0', private: true, peerDependencies: { core: '^2.0.0' } };
  fs.writeFileSync(path.join(cwd, packageDir, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
  fs.writeFileSync(
    path.join(cwd, packageDir, 'CHANGELOG.md'),
    '# Change Log\n\n## 1.0.0 (pending publication)\n\n### Breaking changes\n\n- Preserve reviewed migration notes.\n\n## 0.1.0 (2026-01-01)\n\n- Older notes.\n',
  );
  fs.writeFileSync(path.join(cwd, 'other-package.txt'), 'unchanged\n');
  git('add', '.');
  git('commit', '-m', 'feat(enrichment): prepare independent release');
  git('push', '-u', 'origin', 'main');
  fs.mkdirSync(path.join(root, 'bin'));
  fs.writeFileSync(
    path.join(root, 'bin', 'pnpm'),
    `#!/usr/bin/env node
if (process.argv.slice(2).join(' ') !== 'view ${packageName} versions --json') process.exit(90);
if (process.env.REGISTRY_ERROR) process.exit(1);
console.log(process.env.PUBLISHED_VERSIONS || '[]');
`,
    { mode: 0o755 },
  );
  fs.writeFileSync(
    path.join(root, 'bin', 'gh'),
    `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const state = process.env.TEST_GITHUB_STATE;
if (process.env.GH_ERROR) { console.error('gh: service unavailable (HTTP 503)'); process.exit(1); }
if (args[0] === 'api') {
  if (fs.existsSync(state)) console.log(fs.readFileSync(state, 'utf8'));
  else { console.error('gh: Not Found (HTTP 404)'); process.exit(1); }
} else if (args[0] === 'release' && args[1] === 'create') {
  if (process.env.CREATE_ERROR) { console.error('creation failed'); process.exit(1); }
  if (fs.existsSync(state)) process.exit(91);
  const release = { tag_name: args[2], html_url: 'https://github.com/test/repo/releases/1', draft: false,
    body: fs.readFileSync(args[args.indexOf('--notes-file') + 1], 'utf8'), args };
  fs.writeFileSync(state, JSON.stringify(release));
  console.log(release.html_url);
} else process.exit(92);
`,
    { mode: 0o755 },
  );
  const execute = (command, extra = {}) =>
    spawnSync(process.execPath, [script, command], {
      cwd,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${root}/bin:${process.env.PATH}`,
        GITHUB_OUTPUT: path.join(root, 'outputs'),
        RELEASE_VERSION: '1.0.0',
        RELEASE_BRANCH: 'main',
        GITHUB_REPOSITORY: 'test/repo',
        TEST_GITHUB_STATE: state,
        ...extra,
      },
    });
  const ok = (command, extra) => {
    const result = execute(command, extra);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    return result.stdout;
  };
  return { root, cwd, remote, state, git, execute, ok };
}

test('prepares only the plugin metadata, pushes commit and tag, and creates a normal release', (t) => {
  const f = fixture(t);
  const parent = f.git('rev-parse', 'HEAD');
  f.ok('prepare');
  const sha = f.git('rev-parse', 'HEAD');
  assert.notEqual(sha, parent);
  assert.equal(f.git('log', '-1', '--format=%s'), 'chore(release): publish');
  assert.equal(f.git('rev-parse', `${tag}^{commit}`), sha);
  assert.equal(f.git('diff', '--name-only', parent), `${packageDir}/CHANGELOG.md`);
  const changelog = fs.readFileSync(path.join(f.cwd, packageDir, 'CHANGELOG.md'), 'utf8');
  assert.match(changelog, /## 1.0.0 \(\d{4}-\d{2}-\d{2}\)/);
  assert.match(changelog, /Preserve reviewed migration notes/);
  assert.doesNotMatch(changelog, /pending publication/);
  assert.equal(f.git('ls-remote', '--tags', 'origin'), '');
  f.ok('push');
  assert.match(f.git('ls-remote', 'origin', 'refs/heads/main'), new RegExp(`^${sha}`));
  assert.match(f.git('ls-remote', '--tags', 'origin'), new RegExp(sha));
  f.ok('release');
  const release = JSON.parse(fs.readFileSync(f.state));
  assert.equal(release.tag_name, tag);
  assert.match(release.body, /Preserve reviewed migration notes/);
  assert.doesNotMatch(release.body, /Older notes|pending|approval/);
  assert.ok(release.args.includes('--verify-tag'));
  assert.ok(release.args.includes('--latest=false'));
  assert.ok(!release.args.includes('--draft'));
});

test('a new version updates only the plugin manifest and prepends plugin-specific release notes', (t) => {
  const f = fixture(t);
  const base = f.git('rev-parse', 'HEAD');
  f.git('tag', `${packageName}@1.0.0`);
  fs.writeFileSync(path.join(f.cwd, packageDir, 'feature.ts'), '// new feature\n');
  f.git('add', '.');
  f.git('commit', '-m', 'feat(enrichment): add feature');
  fs.writeFileSync(path.join(f.cwd, 'other-package.txt'), 'another package\n');
  f.git('add', '.');
  f.git('commit', '-m', 'feat(other): unrelated feature');
  f.git('push', 'origin', 'main');
  const source = f.git('rev-parse', 'HEAD');
  f.ok('prepare', { RELEASE_VERSION: '1.1.0' });
  assert.equal(f.git('diff', '--name-only', source), `${packageDir}/CHANGELOG.md\n${packageDir}/package.json`);
  const manifest = JSON.parse(fs.readFileSync(path.join(f.cwd, packageDir, 'package.json')));
  assert.equal(manifest.version, '1.1.0');
  assert.equal(manifest.private, true);
  assert.deepEqual(manifest.peerDependencies, { core: '^2.0.0' });
  const notes = versionSection(fs.readFileSync(path.join(f.cwd, packageDir, 'CHANGELOG.md'), 'utf8'), '1.1.0').notes;
  assert.match(notes, /add feature/);
  assert.doesNotMatch(notes, /unrelated feature|prepare independent/);
  assert.notEqual(base, f.git('rev-parse', 'HEAD'));
});

test('retry after a failed GitHub release reuses the pushed source, even when main has advanced', (t) => {
  const f = fixture(t);
  f.ok('prepare');
  const sha = f.git('rev-parse', 'HEAD');
  f.ok('push');
  assert.notEqual(f.execute('release', { CREATE_ERROR: 'true' }).status, 0);
  fs.writeFileSync(path.join(f.cwd, 'other-package.txt'), 'later work\n');
  f.git('add', '.');
  f.git('commit', '-m', 'fix(other): later work');
  f.git('push', 'origin', 'HEAD:main');
  const latest = f.git('rev-parse', 'HEAD');
  assert.match(f.ok('prepare'), /complete=false/);
  assert.equal(f.git('rev-parse', 'HEAD'), sha);
  f.ok('push');
  f.ok('release');
  assert.match(f.git('ls-remote', 'origin', 'refs/heads/main'), new RegExp(latest));
  assert.match(f.ok('prepare'), /complete=true/);
  f.ok('release');
  assert.equal(f.git('rev-parse', 'HEAD'), sha);
});

test('an atomic push rejects concurrent main changes without creating a remote tag', (t) => {
  const f = fixture(t);
  f.ok('prepare');
  const prepared = f.git('rev-parse', 'HEAD');
  f.git('checkout', '--detach', 'HEAD^');
  fs.writeFileSync(path.join(f.cwd, 'other-package.txt'), 'concurrent work\n');
  f.git('add', '.');
  f.git('commit', '-m', 'fix(other): concurrent work');
  f.git('push', 'origin', 'HEAD:main');
  f.git('checkout', '--detach', prepared);
  assert.notEqual(f.execute('push').status, 0);
  assert.equal(f.git('ls-remote', '--tags', 'origin'), '');
});

test('rejects a dispatch from a stale branch commit', (t) => {
  const f = fixture(t);
  const old = f.git('rev-parse', 'HEAD');
  fs.writeFileSync(path.join(f.cwd, 'other-package.txt'), 'later work\n');
  f.git('add', '.');
  f.git('commit', '-m', 'fix(other): later work');
  f.git('push', 'origin', 'main');
  f.git('checkout', '--detach', old);
  assert.match(f.execute('prepare').stderr, /branch advanced/);
  assert.equal(f.git('tag', '--list'), '');
});

for (const version of ['../bad', '1.0.1-beta.0', '01.0.1', '0.9.0']) {
  test(`rejects invalid or lower version ${version}`, (t) => {
    const f = fixture(t);
    const sha = f.git('rev-parse', 'HEAD');
    assert.notEqual(f.execute('prepare', { RELEASE_VERSION: version }).status, 0);
    assert.equal(f.git('rev-parse', 'HEAD'), sha);
    assert.equal(f.git('status', '--porcelain'), '');
  });
}

test('refuses a published version without a matching release tag', (t) => {
  const f = fixture(t);
  assert.match(f.execute('prepare', { PUBLISHED_VERSIONS: '["1.0.0"]' }).stderr, /already on npm/);
  assert.equal(f.git('tag', '--list'), '');
});

test('does not treat registry failures as an unpublished version', (t) => {
  const f = fixture(t);
  assert.notEqual(f.execute('prepare', { REGISTRY_ERROR: 'true' }).status, 0);
  assert.equal(f.git('status', '--porcelain'), '');
});

test('refuses to reuse a tag from another release process', (t) => {
  const f = fixture(t);
  f.git('tag', tag);
  f.git('push', 'origin', tag);
  assert.match(f.execute('prepare').stderr, /not created by this release workflow/);
});

test('does not overwrite GitHub releases or mistake API errors for missing releases', (t) => {
  const f = fixture(t);
  f.ok('prepare');
  f.ok('push');
  assert.match(f.execute('release', { GH_ERROR: 'true' }).stderr, /503/);
  assert.equal(fs.existsSync(f.state), false);
  fs.writeFileSync(f.state, JSON.stringify({ tag_name: tag, draft: true }));
  assert.notEqual(f.execute('release').status, 0);
  assert.notEqual(f.execute('prepare').status, 0);
});

test('refuses to push dirty tracked files', (t) => {
  const f = fixture(t);
  f.ok('prepare');
  fs.appendFileSync(path.join(f.cwd, packageDir, 'package.json'), ' ');
  assert.match(f.execute('push').stderr, /Tracked files changed/);
  assert.equal(f.git('ls-remote', '--tags', 'origin'), '');
});

test('refuses to replace a conflicting remote tag', (t) => {
  const f = fixture(t);
  f.ok('prepare');
  const sha = f.git('rev-parse', 'HEAD');
  f.ok('push');
  // Simulate a tag changed externally after this checkout fetched it.
  execFileSync('git', ['--git-dir', f.remote, 'update-ref', `refs/tags/${tag}`, `${sha}^`]);
  assert.match(f.execute('push').stderr, /different commit/);
  assert.match(f.git('ls-remote', '--tags', 'origin'), new RegExp(f.git('rev-parse', 'HEAD^')));
});

test('refuses to resume a tag that is not on the selected release branch', (t) => {
  const f = fixture(t);
  f.ok('prepare');
  // Only the tag exists remotely; its commit is not on main.
  f.git('push', 'origin', tag);
  f.git('checkout', '--detach', 'HEAD^');
  assert.notEqual(f.execute('prepare').status, 0);
  assert.equal(fs.existsSync(f.state), false);
});

test('refuses to create a GitHub release from a different checkout', (t) => {
  const f = fixture(t);
  f.ok('prepare');
  f.ok('push');
  f.git('checkout', '--detach', 'HEAD^');
  assert.match(f.execute('release').stderr, /does not match the checked-out/);
  assert.equal(fs.existsSync(f.state), false);
});

test('changelog extraction understands linked existing headings', () => {
  const section = versionSection(
    '## [1.2.3](https://example.com/compare) (2026-01-01)\n\n- Notes\n\n## 1.2.2 (2025-12-01)\n\n- Old\n',
    '1.2.3',
  );
  assert.equal(section.notes, '- Notes');
});
