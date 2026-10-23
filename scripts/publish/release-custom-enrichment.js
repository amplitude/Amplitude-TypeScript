const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const packageName = '@amplitude/plugin-custom-enrichment-browser';
const packageDir = 'packages/plugin-custom-enrichment-browser';
const manifestPath = `${packageDir}/package.json`;
const changelogPath = `${packageDir}/CHANGELOG.md`;
const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function run(command, args) {
  return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
}

function git(...args) {
  return run('git', args);
}

function compareVersions(a, b) {
  const left = a.split('.').map(BigInt);
  const right = b.split('.').map(BigInt);
  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1;
  }
  return 0;
}

function versionSection(changelog, version) {
  const headings = [...changelog.matchAll(/^## (?:\[([^\]]+)\]\([^\n]*?\)|([^\s]+))[^\n]*$/gm)];
  const index = headings.findIndex((heading) => (heading[1] || heading[2]) === version);
  if (index === -1) throw new Error(`Missing changelog entry for ${version}`);
  const heading = headings[index];
  const end = headings[index + 1]?.index ?? changelog.length;
  return { heading, end, notes: changelog.slice(heading.index + heading[0].length, end).trim() };
}

function output(values) {
  for (const [key, value] of Object.entries(values)) {
    console.log(`${key}=${value}`);
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
  }
}

// Only an actual HTTP 404 means there is no release. Authentication and network
// failures must stop the run rather than being mistaken for a new release.
function findRelease(repository, tag) {
  const result = spawnSync('gh', ['api', `repos/${repository}/releases/tags/${encodeURIComponent(tag)}`], {
    encoding: 'utf8',
  });
  if (result.error) throw result.error;
  if (result.status === 0) return JSON.parse(result.stdout);
  if (/\(HTTP 404\)/.test(result.stderr)) return null;
  throw new Error(`Could not inspect GitHub release: ${result.stderr}`);
}

function assertClean() {
  if (git('status', '--porcelain', '--untracked-files=no')) {
    throw new Error('Tracked files changed unexpectedly; refusing to release.');
  }
}

function tagExists(tag) {
  return Boolean(git('tag', '--list', tag));
}

function assertReleaseCommit(tag, version) {
  const manifest = JSON.parse(git('show', `${tag}:${manifestPath}`));
  if (manifest.name !== packageName || manifest.version !== version || manifest.private !== true) {
    throw new Error(`Tag ${tag} does not identify the expected private plugin manifest.`);
  }
  const message = git('log', '-1', '--format=%B', `${tag}^{commit}`);
  if (!message.split('\n').includes(`Custom-Enrichment-Version: ${version}`)) {
    throw new Error(`Tag ${tag} was not created by this release workflow; refusing to reuse it.`);
  }
  const section = versionSection(git('show', `${tag}:${changelogPath}`), version);
  if (!section.notes || !/\(\d{4}-\d{2}-\d{2}\)$/.test(section.heading[0])) {
    throw new Error(`Tag ${tag} has no finalized changelog entry.`);
  }
}

function prepare({ version, branch, repository, tag }) {
  assertClean();
  git('fetch', '--no-tags', 'origin', `+refs/heads/${branch}:refs/remotes/origin/${branch}`);
  git('fetch', 'origin', '--tags');
  const remote = `refs/remotes/origin/${branch}`;
  if (tagExists(tag)) {
    assertReleaseCommit(tag, version);
    git('merge-base', '--is-ancestor', `${tag}^{commit}`, remote);
    git('checkout', '--detach', `${tag}^{commit}`);
    const release = findRelease(repository, tag);
    if (release && (release.tag_name !== tag || release.draft)) {
      throw new Error('An unexpected or draft GitHub release exists; refusing to overwrite it.');
    }
    output({ tag, sha: git('rev-parse', 'HEAD'), complete: Boolean(release) });
    return;
  }
  if (git('rev-parse', 'HEAD') !== git('rev-parse', remote)) {
    throw new Error('The branch advanced after this run was dispatched. Start a new run on the latest commit.');
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.name !== packageName || manifest.private !== true || !stableVersion.test(manifest.version)) {
    throw new Error('Expected the private custom enrichment package with a stable version.');
  }
  if (compareVersions(version, manifest.version) < 0) throw new Error('Cannot release a lower version.');

  // Never attach a new source tag to a version published by some other process.
  const published = JSON.parse(run('pnpm', ['view', packageName, 'versions', '--json']));
  if ([published].flat().includes(version)) {
    throw new Error(`${tag} is already on npm without a matching release tag. Choose a new version.`);
  }

  let changelog = fs.readFileSync(changelogPath, 'utf8');
  const date = new Date().toISOString().slice(0, 10);
  const heading = `## ${version} (${date})`;
  const hasEntry = [...changelog.matchAll(/^## (?:\[([^\]]+)\]\([^\n]*?\)|([^\s]+))[^\n]*$/gm)].some(
    (match) => (match[1] || match[2]) === version,
  );
  if (hasEntry) {
    const section = versionSection(changelog, version);
    if (!section.notes) throw new Error('The release changelog entry is empty.');
    changelog =
      changelog.slice(0, section.heading.index) +
      heading +
      changelog.slice(section.heading.index + section.heading[0].length);
  } else {
    const previousTags = git('tag', '--merged', 'HEAD', '--list', `${packageName}@*`)
      .split('\n')
      .filter((name) => stableVersion.test(name.slice(packageName.length + 1)))
      .sort((a, b) => compareVersions(b.slice(packageName.length + 1), a.slice(packageName.length + 1)));
    const previous = previousTags[0];
    const subjects = git('log', '--format=%s (%h)', previous ? `${previous}..HEAD` : 'HEAD', '--', packageDir)
      .split('\n')
      .filter((subject) => subject && !subject.startsWith('chore(release): publish'));
    const notes = subjects.length
      ? subjects.map((subject) => `- ${subject}`).join('\n')
      : `- Version bump only for ${packageName}.`;
    const firstHeading = changelog.search(/^## /m);
    if (firstHeading < 0) throw new Error('Expected an existing versioned changelog.');
    changelog = changelog.slice(0, firstHeading) + `${heading}\n\n${notes}\n\n` + changelog.slice(firstHeading);
  }
  manifest.version = version;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  fs.writeFileSync(changelogPath, changelog);
  git('add', '--', manifestPath, changelogPath);
  git(
    '-c',
    'user.name=amplitude-sdk-dev',
    '-c',
    'user.email=249154226+amplitude-sdk-dev@users.noreply.github.com',
    '-c',
    'core.hooksPath=/dev/null',
    'commit',
    '--allow-empty',
    '-m',
    'chore(release): publish',
    '-m',
    `${tag}\n\nCustom-Enrichment-Version: ${version}`,
  );
  git(
    '-c',
    'user.name=amplitude-sdk-dev',
    '-c',
    'user.email=249154226+amplitude-sdk-dev@users.noreply.github.com',
    'tag',
    '-a',
    tag,
    '-m',
    tag,
  );
  output({ tag, sha: git('rev-parse', 'HEAD'), complete: false });
}

function push({ branch, tag, version }) {
  assertClean();
  assertReleaseCommit(tag, version);
  const sha = git('rev-parse', `${tag}^{commit}`);
  if (git('rev-parse', 'HEAD') !== sha) throw new Error('HEAD does not match the release tag.');
  const remoteTag = git('ls-remote', '--tags', 'origin', `refs/tags/${tag}`, `refs/tags/${tag}^{}`);
  if (remoteTag) {
    if (!remoteTag.split('\n').includes(`${sha}\trefs/tags/${tag}^{}`)) {
      throw new Error('The remote release tag points to a different commit.');
    }
    git('fetch', '--no-tags', 'origin', `+refs/heads/${branch}:refs/remotes/origin/${branch}`);
    git('merge-base', '--is-ancestor', sha, `refs/remotes/origin/${branch}`);
    return;
  }
  // A normal fast-forward push rejects a concurrent branch update. Atomic push
  // ensures a failed branch update cannot leave a release tag behind.
  git('push', '--atomic', 'origin', `${sha}:refs/heads/${branch}`, `refs/tags/${tag}:refs/tags/${tag}`);
}

function release({ repository, tag, version }) {
  assertReleaseCommit(tag, version);
  if (git('rev-parse', 'HEAD') !== git('rev-parse', `${tag}^{commit}`)) {
    throw new Error('The release tag does not match the checked-out release commit.');
  }
  const existing = findRelease(repository, tag);
  if (existing) {
    if (existing.tag_name !== tag || existing.draft) throw new Error('Unexpected existing GitHub release.');
    output({ url: existing.html_url });
    return;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'enrichment-release-'));
  try {
    const notesFile = path.join(dir, 'notes.md');
    fs.writeFileSync(notesFile, versionSection(git('show', `${tag}:${changelogPath}`), version).notes + '\n');
    const url = run('gh', [
      'release',
      'create',
      tag,
      '--repo',
      repository,
      '--verify-tag',
      '--latest=false',
      '--title',
      tag,
      '--notes-file',
      notesFile,
    ]);
    output({ url });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function main() {
  const version = process.env.RELEASE_VERSION;
  const branch = process.env.RELEASE_BRANCH;
  const repository = process.env.GITHUB_REPOSITORY;
  if (!stableVersion.test(version || '')) throw new Error('Enter an exact stable version, e.g. 1.0.1.');
  if (branch !== 'main' && !branch?.startsWith('hotfix/')) throw new Error('Use main or a hotfix branch.');
  git('check-ref-format', '--branch', branch);
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository || '')) throw new Error('Invalid GitHub repository.');
  const config = { version, branch, repository, tag: `${packageName}@${version}` };
  const command = { prepare, push, release }[process.argv[2]];
  if (!command) throw new Error('Expected prepare, push, or release.');
  command(config);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { compareVersions, versionSection };
