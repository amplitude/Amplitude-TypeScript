// Public-API compatibility guard (SDKRN-14).
//
// This is a *source-level public-API* guard: it locks the SHAPE of the
// package's public API BETWEEN RELEASES so that any change which removes,
// renames, or retypes a public export (or a field on a public type, or a
// `MaskLevel` member) FAILS this test and forces a conscious decision plus a
// semver bump. It is the lightweight, dependency-free equivalent of a
// Microsoft API Extractor `.api.md` golden report (api-extractor is not used
// anywhere in this monorepo and pulling it into a single package — against the
// repo-pinned TypeScript 4.9 — was judged too heavy; see SDKRN-14 notes).
//
// How it works:
//   1. A TypeScript `Program` is built from the package entrypoint and the
//      checker resolves the fully-expanded shape of every export (see
//      `utils/public-api-surface.ts` for why we resolve via the checker rather
//      than snapshotting the re-export-only emitted `.d.ts`).
//   2. The serialized surface is compared against the committed golden report
//      `public-api.api.md`, which is the human-reviewable record of the API.
//
// To intentionally accept an API change, regenerate the golden:
//   UPDATE_PUBLIC_API=1 pnpm --filter @amplitude/plugin-session-replay-react-native test
// and review the resulting diff to `public-api.api.md` as part of the PR.

import * as fs from 'fs';
import * as path from 'path';

import { extractPublicApiSurface } from './utils/public-api-surface';

const ENTRYPOINT = path.join(__dirname, '..', 'src', 'index.tsx');
const STANDALONE_SRC = path.join(__dirname, '..', '..', 'session-replay-react-native', 'src', 'index.tsx');
const GOLDEN_PATH = path.join(__dirname, 'public-api.api.md');

describe('public API surface (SDKRN-14 compatibility guard)', () => {
  const surface = extractPublicApiSurface({
    entrypoint: ENTRYPOINT,
    paths: {
      '@amplitude/session-replay-react-native': STANDALONE_SRC,
    },
  });

  if (process.env.UPDATE_PUBLIC_API) {
    fs.writeFileSync(GOLDEN_PATH, surface);
  }

  it('matches the committed golden report (public-api.api.md)', () => {
    const golden = fs.readFileSync(GOLDEN_PATH, 'utf8');
    // A mismatch means the resolved PUBLIC API shape changed between releases.
    // If intentional, regenerate with UPDATE_PUBLIC_API=1 and review the diff.
    expect(surface).toEqual(golden);
  });

  // Targeted assertions documenting the specific invariants the snapshot
  // protects. These give a focused failure message for the highest-value
  // breakages even before a maintainer diffs the golden file.
  it('locks the exact set of public exports', () => {
    const exportNames = [...surface.matchAll(/^export \S+ (\S+)/gm)].map((m) => m[1]).sort();
    expect(exportNames).toEqual([
      'AmpMaskView',
      'MaskLevel',
      'PrivacyConfig',
      'SessionReplayConfig',
      'SessionReplayPlugin',
      'SessionReplayPluginConfig',
    ]);
  });

  it('locks the exact MaskLevel literal-union members (no additions/removals)', () => {
    // Anchored to a full line so adding or removing a member also fails here,
    // not just the golden-report comparison.
    expect(surface).toMatch(/\n {2}"conservative" \| "light" \| "medium"\n/);
  });

  it('keeps SessionReplayPlugin a runtime value (class), not a type-only export', () => {
    expect(surface).toContain('export class SessionReplayPlugin  // [value+type]');
  });

  it('exposes no default export (consumers rely on named imports)', () => {
    // A `default` export would surface as `export <kind> default` in the report;
    // assert its absence so adding one is a loud, intentional change.
    expect(surface).not.toMatch(/^export \S+ default\b/m);
  });
});
