# G&S lifecycle runtime fixture

`engagement-runtime.js.gz` is the production monolithic browser bundle built from
[assistance-browser revision 3badaa8fb06f109d66ef1d534a6d44465aef22a0](https://github.com/amplitude/assistance-browser/commit/3badaa8fb06f109d66ef1d534a6d44465aef22a0),
the GSW-2020 listener teardown change. The wrapper's embedded proxy comes from the
same revision's minified dynamic-script build. No generated JavaScript was patched.

The browser regression decompresses this fixture, checks its SHA-256, serves it
behind the embedded proxy's script request, and mocks backend APIs. It requires no
live G&S environment or CDN downloads. The decompressed runtime SHA-256 is
`f74cef5315357a351c992cef510066879ffb6de6be7dfede14dda26c2e5a0e08`.

To regenerate, install that revision's locked dependencies and run its exported
`runBuild` function from `packages/browser/scripts/util/esbuild.ts` with:

- `minifiedConfig()` from `scripts/dynamic-script/config.ts` for the embedded proxy.
- `defaultConfig('prod')` from `scripts/bundle/config.ts` for this runtime.

Run from the checkout's `packages/browser` directory, setting `outfile` to an
absolute temporary path for each build. Use the checkout's installed `tsx` loader
and Node 24. Compress the runtime deterministically with Python's
`gzip.compress(runtime_bytes, mtime=0)`. Wrap the generated proxy in the existing
`engagementSnippet` function, retaining the source revision comment. Update the
checksum assertion if intentionally changing the pinned source revision.
