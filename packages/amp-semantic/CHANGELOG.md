# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# 0.2.0-codexsemantic-review-integration.0 (2026-10-23)


### Bug Fixes

* **amp-semantic:** bound feedback work and prevent event starvation ([7556c76](https://github.com/amplitude/Amplitude-TypeScript/commit/7556c7617286c2833887cbe997d637fd6dfd5569))
* **amp-semantic:** coalesce visibility and focus transitions ([3ae83ae](https://github.com/amplitude/Amplitude-TypeScript/commit/3ae83ae732462e8b150d8cee42bd5e0ea1e44d05))
* **amp-semantic:** discard detached dialog names after privacy changes ([3476c31](https://github.com/amplitude/Amplitude-TypeScript/commit/3476c31018f561d9e776b8be287923c969beb4bf))
* **amp-semantic:** emit only visibility state transitions ([97fe1f8](https://github.com/amplitude/Amplitude-TypeScript/commit/97fe1f8d18d9a5f7a23d115ab161a861cb084afc))
* **amp-semantic:** omit focus snapshots from visibility events ([0d0fc8a](https://github.com/amplitude/Amplitude-TypeScript/commit/0d0fc8a7983716ed47696b0fc719f2af55d19548))


### Features

* **amp-semantic:** add lifecycle recorders and session replay adapter ([d7fec31](https://github.com/amplitude/Amplitude-TypeScript/commit/d7fec31d1ee3e715b93302623eb88c13a0aa1658))
* **amp-semantic:** add tab identity and focus observations ([3b23949](https://github.com/amplitude/Amplitude-TypeScript/commit/3b23949fafb4ab425b6997ebf8a0360576647cd4))
* **amp-semantic:** capture click field and submit facts ([b9731f7](https://github.com/amplitude/Amplitude-TypeScript/commit/b9731f7a2aa0a9d95cd989ec79f86973615db126))
* **amp-semantic:** capture interaction and checked states ([748197d](https://github.com/amplitude/Amplitude-TypeScript/commit/748197d9a5bb2bf0cf40c7e115b246aa1abcbce4))
* **amp-semantic:** capture keys and resource load failures ([7a1f6b5](https://github.com/amplitude/Amplitude-TypeScript/commit/7a1f6b58a3f27fcf8d971ebd6a935833bc31f583))
* **amp-semantic:** capture page state, notices, and dialogs ([bc83383](https://github.com/amplitude/Amplitude-TypeScript/commit/bc8338340c85f92a932e0032198f5f7c09a1b285))
* **amp-semantic:** capture privacy-permitted field values ([f8fbdae](https://github.com/amplitude/Amplitude-TypeScript/commit/f8fbdae188883908c017c4706f2f714fbf2eb329))
* **amp-semantic:** capture visibility and user agent context ([93e1098](https://github.com/amplitude/Amplitude-TypeScript/commit/93e10981634ec66ed73083ab30493612b0bbb6b5))
* **amp-semantic:** enrich interaction accessibility metadata ([faff482](https://github.com/amplitude/Amplitude-TypeScript/commit/faff482cca00f274702d3df1d08c93b1ea7807fd))
* **amp-semantic:** establish standalone package and recorder contracts ([d629dd4](https://github.com/amplitude/Amplitude-TypeScript/commit/d629dd44515338bf1cfd9e4965d413f7719278eb))
* **amp-semantic:** integrate extensible capture runtime and privacy-safe helpers ([1701d99](https://github.com/amplitude/Amplitude-TypeScript/commit/1701d996d304af0b09e7c45ee57a32628b48c087))
* **amp-semantic:** mirror accepted analytics frustration events ([cb93e70](https://github.com/amplitude/Amplitude-TypeScript/commit/cb93e709d713276279fd4ed41682bbe359c5f572))
* **amp-semantic:** reuse replay URL events for navigation ([0dc1e03](https://github.com/amplitude/Amplitude-TypeScript/commit/0dc1e03f02e54ffceb564103519a6b74c4d8774b))
* **amp-semantic:** share activity detection for click outcome fallback ([599ce3f](https://github.com/amplitude/Amplitude-TypeScript/commit/599ce3fe757cdd0b7889d929a4061e29e61fac17))


### Performance Improvements

* **amp-semantic:** bound DOM work and shorten mutation observation ([ed3ef8f](https://github.com/amplitude/Amplitude-TypeScript/commit/ed3ef8f1064ee5449d36084ed142633aee8f7ded))
* **amp-semantic:** derive feedback from recorded rrweb changes ([64b072e](https://github.com/amplitude/Amplitude-TypeScript/commit/64b072e8458021e682eb09a4cbe02c50de800fdd))
* **session-replay:** share rrweb clicks with semantic capture ([0acda6d](https://github.com/amplitude/Amplitude-TypeScript/commit/0acda6d2c67f21318f037bd76aff7774f60716fb))
