# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [2.37.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.36.1...@amplitude/analytics-core@2.37.0) (2026-01-26)


### Features

* **analytics-browser:** add shouldTrackSubmit for custom form validation ([#1500](https://github.com/amplitude/Amplitude-TypeScript/issues/1500)) ([1d76745](https://github.com/amplitude/Amplitude-TypeScript/commit/1d76745dc202e27d188bfe47ae76d69806bbb566))





## [2.36.1](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.36.0...@amplitude/analytics-core@2.36.1) (2026-01-21)

**Note:** Version bump only for package @amplitude/analytics-core





# [2.36.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.35.2...@amplitude/analytics-core@2.36.0) (2026-01-15)


### Features

* **analytics-core:** add console observer helper ([#1478](https://github.com/amplitude/Amplitude-TypeScript/issues/1478)) ([f81ad91](https://github.com/amplitude/Amplitude-TypeScript/commit/f81ad91459cb0b69d1fdb2c4bcc463ac887dd44f))





## [2.35.2](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.35.1...@amplitude/analytics-core@2.35.2) (2026-01-14)


### Bug Fixes

* **analytics-browser:** re-entrant error in cookies.isEnabled ([#1493](https://github.com/amplitude/Amplitude-TypeScript/issues/1493)) ([ed4f62c](https://github.com/amplitude/Amplitude-TypeScript/commit/ed4f62cb57a389deb1b67f3fdb310e30caf7e3e2))
* **plugin-autocapture-browser:** allow selective configuration of frustration interactions ([#1489](https://github.com/amplitude/Amplitude-TypeScript/issues/1489)) ([5350f5b](https://github.com/amplitude/Amplitude-TypeScript/commit/5350f5b53d134b516f1e0e0cd202090015751ce0))





## [2.35.1](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.35.0...@amplitude/analytics-core@2.35.1) (2026-01-14)


### Bug Fixes

* **analytics-browser:** two cookie problem resolution ([#1490](https://github.com/amplitude/Amplitude-TypeScript/issues/1490)) ([506638a](https://github.com/amplitude/Amplitude-TypeScript/commit/506638a2a412dc3843b0da9450325f70ff465422))





# [2.35.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.34.1...@amplitude/analytics-core@2.35.0) (2025-12-24)


### Features

* **analytics-browser:** add support to set headers for transport pro… ([#1444](https://github.com/amplitude/Amplitude-TypeScript/issues/1444)) ([c277239](https://github.com/amplitude/Amplitude-TypeScript/commit/c277239d317106496f7a08fc2933e72e391be9de))





## [2.34.1](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.34.0...@amplitude/analytics-core@2.34.1) (2025-12-16)


### Bug Fixes

* **plugin-page-url-enrichment-browser:** add internalDomains config for subdomain matching ([#1433](https://github.com/amplitude/Amplitude-TypeScript/issues/1433)) ([cf97ca3](https://github.com/amplitude/Amplitude-TypeScript/commit/cf97ca344e81666d4227aba67b0368d2213c9b34))





# [2.34.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.33.0...@amplitude/analytics-core@2.34.0) (2025-12-09)


### Features

* diagnostics uncaught sdk errors installed by script  ([#1419](https://github.com/amplitude/Amplitude-TypeScript/issues/1419)) ([dc0b3cc](https://github.com/amplitude/Amplitude-TypeScript/commit/dc0b3cc9df5915d1bfb773b64099c70fc9408fda))





# [2.33.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.32.2...@amplitude/analytics-core@2.33.0) (2025-11-21)


### Features

* **analytics-browser:** reduce bundle size via refactoring out rxjs ([#1391](https://github.com/amplitude/Amplitude-TypeScript/issues/1391)) ([09ade0b](https://github.com/amplitude/Amplitude-TypeScript/commit/09ade0b37cfdbaacb0e328cb812168d60dc25124))





## [2.32.2](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.32.1...@amplitude/analytics-core@2.32.2) (2025-11-20)


### Bug Fixes

* **analytics-core:** record unsuccessful response from catch error ([#1411](https://github.com/amplitude/Amplitude-TypeScript/issues/1411)) ([c298d58](https://github.com/amplitude/Amplitude-TypeScript/commit/c298d58e3d32eb3bafe61d7d6efbcb9c775c363b))





## [2.32.1](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.32.0...@amplitude/analytics-core@2.32.1) (2025-11-17)


### Bug Fixes

* **analytics-core:** record unsuccessful response ([#1405](https://github.com/amplitude/Amplitude-TypeScript/issues/1405)) ([7e842fe](https://github.com/amplitude/Amplitude-TypeScript/commit/7e842feb0aa36ec4274b97a205b19613f3b5c642))





# [2.32.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.31.1...@amplitude/analytics-core@2.32.0) (2025-11-17)


### Bug Fixes

* **analytics-core:** batch remote config requests ([#1398](https://github.com/amplitude/Amplitude-TypeScript/issues/1398)) ([29da299](https://github.com/amplitude/Amplitude-TypeScript/commit/29da299e7c378a2c4221826f1b87e94aa6df3cb7))
* **analytics-core:** remote config should not return null from cache for first time users ([#1401](https://github.com/amplitude/Amplitude-TypeScript/issues/1401)) ([568554a](https://github.com/amplitude/Amplitude-TypeScript/commit/568554a4849ff9069ae6948783458bc3c2997523))


### Features

* **analytics-browser:** add reset listener API ([#1393](https://github.com/amplitude/Amplitude-TypeScript/issues/1393)) ([7bd85e5](https://github.com/amplitude/Amplitude-TypeScript/commit/7bd85e51b01cefdb43b8474d930e8c219b739323))


### Reverts

* "fix: make setDiagnosticsRate an optional function ([#1382](https://github.com/amplitude/Amplitude-TypeScript/issues/1382))" ([#1394](https://github.com/amplitude/Amplitude-TypeScript/issues/1394)) ([f8ddc88](https://github.com/amplitude/Amplitude-TypeScript/commit/f8ddc88961e14a3ae7ad7e79ac7a182e84b158a0))





## [2.31.1](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.31.0...@amplitude/analytics-core@2.31.1) (2025-11-05)


### Bug Fixes

* make setDiagnosticsRate an optional function ([#1382](https://github.com/amplitude/Amplitude-TypeScript/issues/1382)) ([8898186](https://github.com/amplitude/Amplitude-TypeScript/commit/889818637c41c6469a89b70553e8dcfc9725ab87))





# [2.31.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.30.0...@amplitude/analytics-core@2.31.0) (2025-10-29)


### Features

* more diagnostics metrics ([#1371](https://github.com/amplitude/Amplitude-TypeScript/issues/1371)) ([40e255c](https://github.com/amplitude/Amplitude-TypeScript/commit/40e255c89c98f4ffffd883296d3d8a9947326aaa))





# [2.30.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.29.0...@amplitude/analytics-core@2.30.0) (2025-10-23)


### Features

* **autocapture:** set page url enrichment plugin to default on and add/fix tests ([#1287](https://github.com/amplitude/Amplitude-TypeScript/issues/1287)) ([d96d7dd](https://github.com/amplitude/Amplitude-TypeScript/commit/d96d7dd7db156eae51a342b4956db2530ca64d29))





# [2.29.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.28.0...@amplitude/analytics-core@2.29.0) (2025-10-23)


### Features

* **analytics-browser:** add remote config server url to proxy remote config requests ([#1348](https://github.com/amplitude/Amplitude-TypeScript/issues/1348)) ([461b598](https://github.com/amplitude/Amplitude-TypeScript/commit/461b59876a75af0d97fd639c35ce08f6b0f4c24b))





# [2.28.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.27.2...@amplitude/analytics-core@2.28.0) (2025-10-17)


### Features

* make web-vitals autocapture GA ([#1347](https://github.com/amplitude/Amplitude-TypeScript/issues/1347)) ([178862f](https://github.com/amplitude/Amplitude-TypeScript/commit/178862f87e6ea8a882c1d612f48692ab1ab65e14))





## [2.27.2](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.27.1...@amplitude/analytics-core@2.27.2) (2025-10-15)


### Bug Fixes

* **plugin-page-view-tracking-browser:** migrate to analytics-core ([#1341](https://github.com/amplitude/Amplitude-TypeScript/issues/1341)) ([676d347](https://github.com/amplitude/Amplitude-TypeScript/commit/676d347a04a6bd1ab5264ac8f58a358fd983ea54))





## [2.27.1](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.27.0...@amplitude/analytics-core@2.27.1) (2025-10-14)


### Bug Fixes

* **analytics-core:** diagnostics client use temp sampling algo ([#1340](https://github.com/amplitude/Amplitude-TypeScript/issues/1340)) ([3e89dd7](https://github.com/amplitude/Amplitude-TypeScript/commit/3e89dd7a678cf7043d843949b0c7934e74f59d29))





# [2.27.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.26.2...@amplitude/analytics-core@2.27.0) (2025-10-14)


### Features

* **autocapture:** refactor getPageTitle from autocapture to make it reusable ([#1331](https://github.com/amplitude/Amplitude-TypeScript/issues/1331)) ([44eabd1](https://github.com/amplitude/Amplitude-TypeScript/commit/44eabd1139252ed71845d29a86ceccd2ef119d15))
* **plugin-network-capture-browser:** make networkTracking headers + body capturing GA ([#1334](https://github.com/amplitude/Amplitude-TypeScript/issues/1334)) ([8b57656](https://github.com/amplitude/Amplitude-TypeScript/commit/8b576569d28f323b21f6c82d708867d91c641063))





## [2.26.2](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.26.1...@amplitude/analytics-core@2.26.2) (2025-10-03)


### Bug Fixes

* add diagnostics to client and track autocapture getHierachy block time ([#1312](https://github.com/amplitude/Amplitude-TypeScript/issues/1312)) ([a919e22](https://github.com/amplitude/Amplitude-TypeScript/commit/a919e223428083a87954cffa50bc765baa5360b0))





## [2.26.1](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.26.0...@amplitude/analytics-core@2.26.1) (2025-10-01)


### Bug Fixes

* suppress relative url errors ([#1311](https://github.com/amplitude/Amplitude-TypeScript/issues/1311)) ([9f3b3b0](https://github.com/amplitude/Amplitude-TypeScript/commit/9f3b3b0ded160ef56e046a35d7f0eb747a2a4ef3))





# [2.26.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.25.0...@amplitude/analytics-core@2.26.0) (2025-09-25)


### Features

* **analytics-browser:** add "identify" to config ([#1303](https://github.com/amplitude/Amplitude-TypeScript/issues/1303)) ([693720c](https://github.com/amplitude/Amplitude-TypeScript/commit/693720c348eaac0ffef8b88454deae06ceca0bb4))





# [2.25.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.24.1...@amplitude/analytics-core@2.25.0) (2025-09-23)


### Bug Fixes

* **analytics-core:** add events support for diagnostics client ([#1301](https://github.com/amplitude/Amplitude-TypeScript/issues/1301)) ([9671929](https://github.com/amplitude/Amplitude-TypeScript/commit/9671929b6cfa63621e6e8ca6f2575d057990775e))


### Features

* **analytics-core:** add diagnostics client ([#1281](https://github.com/amplitude/Amplitude-TypeScript/issues/1281)) ([c511002](https://github.com/amplitude/Amplitude-TypeScript/commit/c5110024832f09d3f69d25077c4c5b825e538e6c))





## [2.24.1](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.24.0...@amplitude/analytics-core@2.24.1) (2025-09-18)


### Bug Fixes

* **analytics-browser:** add URI decoding to Element Clicked event attribute ([#1297](https://github.com/amplitude/Amplitude-TypeScript/issues/1297)) ([ebb2120](https://github.com/amplitude/Amplitude-TypeScript/commit/ebb212080948e8acbaeadbdc410580e04202f818))





# [2.24.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.23.0...@amplitude/analytics-core@2.24.0) (2025-09-12)


### Features

* **analytics-browser:** make frustrationInteractions GA ([#1286](https://github.com/amplitude/Amplitude-TypeScript/issues/1286)) ([40d62be](https://github.com/amplitude/Amplitude-TypeScript/commit/40d62be5e1713a3756464f83bd15d25fe1294956))





# [2.23.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.22.1...@amplitude/analytics-core@2.23.0) (2025-09-05)


### Bug Fixes

* **analytics-core:** strip out basic auth from url ([#1279](https://github.com/amplitude/Amplitude-TypeScript/issues/1279)) ([d9ee8af](https://github.com/amplitude/Amplitude-TypeScript/commit/d9ee8afc34537cf96c05e98bebfad94b3bc426ad))


### Features

* **autocapture:** include pageUrlExcludelist ([#1264](https://github.com/amplitude/Amplitude-TypeScript/issues/1264)) ([dd2aa7f](https://github.com/amplitude/Amplitude-TypeScript/commit/dd2aa7fbb476ead45831f2dc39a94db224131699))





## [2.22.1](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.22.0...@amplitude/analytics-core@2.22.1) (2025-08-28)


### Bug Fixes

* **analytics-core:** handle XHR responseType JSON ([#1276](https://github.com/amplitude/Amplitude-TypeScript/issues/1276)) ([cd35193](https://github.com/amplitude/Amplitude-TypeScript/commit/cd35193ba51cdb986b3a4b8a50989067e3f8bf5b))





# [2.22.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.21.2...@amplitude/analytics-core@2.22.0) (2025-08-26)


### Bug Fixes

* **plugin-network-autocapture:** replace consumption check with cache ([#1274](https://github.com/amplitude/Amplitude-TypeScript/issues/1274)) ([9c41081](https://github.com/amplitude/Amplitude-TypeScript/commit/9c41081ce23aea51ff9c9a82f0b8b9e5e3c53061))


### Features

* **autocapture:** add maskTextRegex option to autocapture ([#1259](https://github.com/amplitude/Amplitude-TypeScript/issues/1259)) ([2f1cf07](https://github.com/amplitude/Amplitude-TypeScript/commit/2f1cf075b3e0728f4124bb5c30c8a7e7c21d5a12))





## [2.21.2](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.21.1...@amplitude/analytics-core@2.21.2) (2025-08-25)


### Bug Fixes

* **plugin-autocapture-browser:** make rage click less noisy ([#1265](https://github.com/amplitude/Amplitude-TypeScript/issues/1265)) ([a31acd3](https://github.com/amplitude/Amplitude-TypeScript/commit/a31acd34f2389d12427daba776ce22a262db7874))





## [2.21.1](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.21.0...@amplitude/analytics-core@2.21.1) (2025-08-22)


### Bug Fixes

* **analytics-core:** fix typo in Reddit click-id ([#1267](https://github.com/amplitude/Amplitude-TypeScript/issues/1267)) ([43e581d](https://github.com/amplitude/Amplitude-TypeScript/commit/43e581d6465546a38373f758f179eee103172755))





# [2.21.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.20.2...@amplitude/analytics-core@2.21.0) (2025-08-21)


### Features

* **analytics-browser:** add urls matching attribute to network capture rules (experimental) ([#1252](https://github.com/amplitude/Amplitude-TypeScript/issues/1252)) ([c28a98c](https://github.com/amplitude/Amplitude-TypeScript/commit/c28a98c13536d3eb2472edcce6ec225539db00aa))
* **plugin-network-capture-browser:** add ability to capture headers (experimental) ([#1253](https://github.com/amplitude/Amplitude-TypeScript/issues/1253)) ([52cfc0c](https://github.com/amplitude/Amplitude-TypeScript/commit/52cfc0c6dab309f30cfce56c091065ff95d95fc2))
* **plugin-network-capture-browser:** add request + response body capture (experimental) ([#1256](https://github.com/amplitude/Amplitude-TypeScript/issues/1256)) ([1850c58](https://github.com/amplitude/Amplitude-TypeScript/commit/1850c58d145973b3bd104ab70368eb4e2fdbafbc))





## [2.20.2](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.20.1...@amplitude/analytics-core@2.20.2) (2025-08-13)

**Note:** Version bump only for package @amplitude/analytics-core





## [2.20.1](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.20.0...@amplitude/analytics-core@2.20.1) (2025-08-08)


### Bug Fixes

* **analytics-core:** should abort remote config request ([#1234](https://github.com/amplitude/Amplitude-TypeScript/issues/1234)) ([394f18b](https://github.com/amplitude/Amplitude-TypeScript/commit/394f18b52c383f30fbed85cb0dcf4fa80df527b5))





# [2.20.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.19.0...@amplitude/analytics-core@2.20.0) (2025-08-05)


### Bug Fixes

* **analtyics-browser): Revert "feat(analytics-browser:** add page-url-previous-page plugin" ([#1237](https://github.com/amplitude/Amplitude-TypeScript/issues/1237)) ([dfd7340](https://github.com/amplitude/Amplitude-TypeScript/commit/dfd7340f6519e647a814b3c66913b0c96b0567cf))
* **analytics-browser:** use the new remote config client ([#1191](https://github.com/amplitude/Amplitude-TypeScript/issues/1191)) ([9af61ea](https://github.com/amplitude/Amplitude-TypeScript/commit/9af61ea1f29fa97644910f37440562e5a6d5eeba))
* **plugin-autocapture-browser:** remove unused configurations from FrustrationInteractions ([#1229](https://github.com/amplitude/Amplitude-TypeScript/issues/1229)) ([d7af23b](https://github.com/amplitude/Amplitude-TypeScript/commit/d7af23b4b02d475475c3249d67ee6e24c49136af))


### Features

* **analytics-browser:** add page-url-previous-page plugin ([#1110](https://github.com/amplitude/Amplitude-TypeScript/issues/1110)) ([dc053ed](https://github.com/amplitude/Amplitude-TypeScript/commit/dc053ed9f0b6378fce6a49f6a6e4196f3622bd25))
* **plugin-page-url-enrichment-browser:** AMP-130401 create Page URL Enrichment plugin for additional Page URL related properties ([#1238](https://github.com/amplitude/Amplitude-TypeScript/issues/1238)) ([4673be8](https://github.com/amplitude/Amplitude-TypeScript/commit/4673be86ab5535fdca66d1743ef4ee071d5fdef7))





# [2.19.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.18.0...@amplitude/analytics-core@2.19.0) (2025-07-29)


### Bug Fixes

* **analytics-react-native:** migrate to analytics-core v2 ([#1216](https://github.com/amplitude/Amplitude-TypeScript/issues/1216)) ([76e85a1](https://github.com/amplitude/Amplitude-TypeScript/commit/76e85a1daa704a1c4c44d0176a56c8dd8d4ad3f1))


### Features

* **analytics-core:** expose unified AmplitudeContext and AnalyticsClient ([#1222](https://github.com/amplitude/Amplitude-TypeScript/issues/1222)) ([7e32712](https://github.com/amplitude/Amplitude-TypeScript/commit/7e327128b4032592897dc6bb50dedda053ad8eda))
* **autocapture:** fetch page actions from remote config ([#1168](https://github.com/amplitude/Amplitude-TypeScript/issues/1168)) ([da213cc](https://github.com/amplitude/Amplitude-TypeScript/commit/da213cc33c4986bcebff2b4264b2c17314f5f310))





# [2.18.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.17.0...@amplitude/analytics-core@2.18.0) (2025-07-17)


### Features

* **analytics-browser:** support autocapture.webVitals ([#1195](https://github.com/amplitude/Amplitude-TypeScript/issues/1195)) ([a186f52](https://github.com/amplitude/Amplitude-TypeScript/commit/a186f523a28d8a322842566b892f50bcf2643142))





# [2.17.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.16.0...@amplitude/analytics-core@2.17.0) (2025-07-15)


### Bug Fixes

* **analytics-browser:** prevent infinite Amplitude network requests ([#1100](https://github.com/amplitude/Amplitude-TypeScript/issues/1100)) ([fde763c](https://github.com/amplitude/Amplitude-TypeScript/commit/fde763cd4889bda41edc55789ee18186711d825e))


### Features

* **analytics-browser:** add experimental frustrationInteractions ([#1209](https://github.com/amplitude/Amplitude-TypeScript/issues/1209)) ([e321744](https://github.com/amplitude/Amplitude-TypeScript/commit/e3217444c58be15e779ff1fd54a55027c93f5db0))
* **analytics-node:** migrate to v2.x core  ([#1207](https://github.com/amplitude/Amplitude-TypeScript/issues/1207)) ([e1c1b28](https://github.com/amplitude/Amplitude-TypeScript/commit/e1c1b28ed2036f7ebb68173f8da2e6cbb82cb287))





# [2.16.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.15.0...@amplitude/analytics-core@2.16.0) (2025-07-08)


### Bug Fixes

* **analytics-core:** more logs in timeline ([#1180](https://github.com/amplitude/Amplitude-TypeScript/issues/1180)) ([dcb6cee](https://github.com/amplitude/Amplitude-TypeScript/commit/dcb6ceee00e3587b8eaf601074940696c94a4466))
* **analytics-core:** remote config use new schema & config group ([#1185](https://github.com/amplitude/Amplitude-TypeScript/issues/1185)) ([db54ae5](https://github.com/amplitude/Amplitude-TypeScript/commit/db54ae5ce87d5d7a4ae49c80aab5037dee3dd03c))


### Features

* **analytics-browser:** change definition of rage click ([#1183](https://github.com/amplitude/Amplitude-TypeScript/issues/1183)) ([108f930](https://github.com/amplitude/Amplitude-TypeScript/commit/108f930114629fdb3d600532a2c6b8b4f6cafd01))





# [2.15.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.14.0...@amplitude/analytics-core@2.15.0) (2025-06-30)


### Features

* add getOptOut() and getIdentity() ([#1174](https://github.com/amplitude/Amplitude-TypeScript/issues/1174)) ([72017c8](https://github.com/amplitude/Amplitude-TypeScript/commit/72017c8a1a54d929542e883e61d61168f214a780))





# [2.14.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.13.0...@amplitude/analytics-core@2.14.0) (2025-06-26)


### Features

* **plugin-autocapture-browser:** add rage+dead clicks to autocapture plugin ([#1146](https://github.com/amplitude/Amplitude-TypeScript/issues/1146)) ([c850f02](https://github.com/amplitude/Amplitude-TypeScript/commit/c850f020a6b56bbd8d64e0f946acaf0eac15ccf7))





# [2.13.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.12.3...@amplitude/analytics-core@2.13.0) (2025-06-25)


### Features

* **autocapture:** Added config to capture event properties ([#1111](https://github.com/amplitude/Amplitude-TypeScript/issues/1111)) ([109c3e2](https://github.com/amplitude/Amplitude-TypeScript/commit/109c3e220293fff92f870f8efe1a6cb4a20bebf4))





## [2.12.3](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.12.2...@amplitude/analytics-core@2.12.3) (2025-06-11)

**Note:** Version bump only for package @amplitude/analytics-core





## [2.12.2](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.12.1...@amplitude/analytics-core@2.12.2) (2025-06-03)


### Bug Fixes

* **analytics-core:** bump version ([#1123](https://github.com/amplitude/Amplitude-TypeScript/issues/1123)) ([65ab775](https://github.com/amplitude/Amplitude-TypeScript/commit/65ab77559dc0a61895043eb10c08922ad4f19690))





## [2.12.1](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.12.0...@amplitude/analytics-core@2.12.1) (2025-05-27)


### Bug Fixes

* **analytics-browser:** support autocapture.networkTracking as object ([#1095](https://github.com/amplitude/Amplitude-TypeScript/issues/1095)) ([121abc7](https://github.com/amplitude/Amplitude-TypeScript/commit/121abc7e69a354cc704de7cbe493b8c79fa6eacd))
* **analytics-browser:** support XHR in network capture ([#1089](https://github.com/amplitude/Amplitude-TypeScript/issues/1089)) ([339d49c](https://github.com/amplitude/Amplitude-TypeScript/commit/339d49cfa7b07ffc20fe085b8548f6489a3029f3))





# [2.12.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.11.2...@amplitude/analytics-core@2.12.0) (2025-05-13)


### Bug Fixes

* **analytics-core:** make network observer event callbacks handle exceptions ([#1071](https://github.com/amplitude/Amplitude-TypeScript/issues/1071)) ([baf46e2](https://github.com/amplitude/Amplitude-TypeScript/commit/baf46e22585f58924b801e301db78c7aecda1b4a))


### Features

* **analytics-core:** add plugins to look up plugin by class type ([#1079](https://github.com/amplitude/Amplitude-TypeScript/issues/1079)) ([14c73b9](https://github.com/amplitude/Amplitude-TypeScript/commit/14c73b9bffcf621b44f66febc2801582e26b7cae))





## [2.11.2](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.11.1...@amplitude/analytics-core@2.11.2) (2025-05-05)


### Bug Fixes

* **analytics-browser:** use performance.now in network capture ([#1060](https://github.com/amplitude/Amplitude-TypeScript/issues/1060)) ([70917e2](https://github.com/amplitude/Amplitude-TypeScript/commit/70917e26369d27adf62e6b9a44a39599a312b3ef))





## [2.11.1](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.11.0...@amplitude/analytics-core@2.11.1) (2025-05-02)

**Note:** Version bump only for package @amplitude/analytics-core





# [2.11.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.10.1...@amplitude/analytics-core@2.11.0) (2025-05-02)


### Features

* **analytics-browser:** autocapture network errors ([#1050](https://github.com/amplitude/Amplitude-TypeScript/issues/1050)) ([104350f](https://github.com/amplitude/Amplitude-TypeScript/commit/104350ffe8b1bd1a7090482ac3bf24d85672bd43))





## [2.10.1](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.10.0...@amplitude/analytics-core@2.10.1) (2025-04-22)


### Bug Fixes

* **analytics-core:** add missing analytics-connector dependency ([#1031](https://github.com/amplitude/Amplitude-TypeScript/issues/1031)) ([820a761](https://github.com/amplitude/Amplitude-TypeScript/commit/820a7614cba3ce58c5e42cdf0f61880619196750))





# [2.10.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.9.0...@amplitude/analytics-core@2.10.0) (2025-04-17)


### Bug Fixes

* **analytics-core:** add support for experiment plugin ([#1033](https://github.com/amplitude/Amplitude-TypeScript/issues/1033)) ([69a20c7](https://github.com/amplitude/Amplitude-TypeScript/commit/69a20c7a895eb4bb4668583ea3371d0ca2df18d2))


### Features

* **analytics-core:** new plugin interfaces onXXXchanged() ([#1025](https://github.com/amplitude/Amplitude-TypeScript/issues/1025)) ([e6fd23b](https://github.com/amplitude/Amplitude-TypeScript/commit/e6fd23b17809d0c7d94e7627636b200166d41a0f))





# [2.9.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.8.1...@amplitude/analytics-core@2.9.0) (2025-04-15)


### Features

* **session-replay-browser:** migrate to core v2.x ([#1022](https://github.com/amplitude/Amplitude-TypeScript/issues/1022)) ([7a665d5](https://github.com/amplitude/Amplitude-TypeScript/commit/7a665d55fff89092ed5f2bb94caa1eb2c7efe5b1))





## [2.8.1](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.8.0...@amplitude/analytics-core@2.8.1) (2025-04-10)


### Bug Fixes

* **uuid:** set UUID's using crypto libraries instead of Math.random ([#852](https://github.com/amplitude/Amplitude-TypeScript/issues/852)) ([54b86bb](https://github.com/amplitude/Amplitude-TypeScript/commit/54b86bba518261e365a0b3ff49cb44521531491c))





# [2.8.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.7.0...@amplitude/analytics-core@2.8.0) (2025-04-07)


### Features

* **analytics-core:** remote config client ([#997](https://github.com/amplitude/Amplitude-TypeScript/issues/997)) ([9a25350](https://github.com/amplitude/Amplitude-TypeScript/commit/9a25350802fc6326501bd31a201534d2f906985b))





# [2.7.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.6.1...@amplitude/analytics-core@2.7.0) (2025-04-02)


### Bug Fixes

* **analytics-browser:** export more types ([#1011](https://github.com/amplitude/Amplitude-TypeScript/issues/1011)) ([561afc2](https://github.com/amplitude/Amplitude-TypeScript/commit/561afc2538da25867db02646829b2eb81693abcd))


### Features

* **analytics-browser:** set default for fetchRemoteConfig option to true ([#1008](https://github.com/amplitude/Amplitude-TypeScript/issues/1008)) ([5138cd1](https://github.com/amplitude/Amplitude-TypeScript/commit/5138cd16be1ff3bb57c38ec0eae5098a1b7933fc))





## [2.6.1](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.6.0...@amplitude/analytics-core@2.6.1) (2025-03-21)


### Bug Fixes

* **analytics-browser:** replace analytics-types with analytics-core ([#993](https://github.com/amplitude/Amplitude-TypeScript/issues/993)) ([f180f05](https://github.com/amplitude/Amplitude-TypeScript/commit/f180f05854393bf18d94f1753d284778ba3b5377))





# [2.6.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.5.6...@amplitude/analytics-core@2.6.0) (2025-03-14)


### Features

* **analytics-core:** add support for revenue receipt and receipt sig ([#991](https://github.com/amplitude/Amplitude-TypeScript/issues/991)) ([e736a65](https://github.com/amplitude/Amplitude-TypeScript/commit/e736a65e35f0462a6b6080e66a27ffaec9a512b5))
* **analytics-core:** merge analytics-client-common  ([#977](https://github.com/amplitude/Amplitude-TypeScript/issues/977)) ([1746ae5](https://github.com/amplitude/Amplitude-TypeScript/commit/1746ae5efb1ecd0e7586bc22ff8a704a6928c26a))
* **analytics-core:** merge analytics-types ([#989](https://github.com/amplitude/Amplitude-TypeScript/issues/989)) ([9f7ed68](https://github.com/amplitude/Amplitude-TypeScript/commit/9f7ed68e8ec468f5c597ce427c70ffd855dde629))





## [2.5.6](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.5.5...@amplitude/analytics-core@2.5.6) (2025-02-28)


### Bug Fixes

* ability to send revenue currency to amplitude ([d4f52e7](https://github.com/amplitude/Amplitude-TypeScript/commit/d4f52e74e9840a3361784dfc37ef21125375d02e))
* adding tests ([ba9688a](https://github.com/amplitude/Amplitude-TypeScript/commit/ba9688a31377a3e7903e9689970a99878e635569))
* **analytics-core:** should not flush until previous request resolves ([#964](https://github.com/amplitude/Amplitude-TypeScript/issues/964)) ([771ce55](https://github.com/amplitude/Amplitude-TypeScript/commit/771ce556cb131b71ddb28461268a6feb5f3a1b1d))


### Reverts

* Revert "chore(release): publish" ([d392f62](https://github.com/amplitude/Amplitude-TypeScript/commit/d392f6290b8bb4dd955d6e6f20b00191679489c4))





## [2.5.5](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.5.4...@amplitude/analytics-core@2.5.5) (2024-12-17)


### Bug Fixes

* amplitude.remove should only remove if plugin was already registered ([ad84bf6](https://github.com/amplitude/Amplitude-TypeScript/commit/ad84bf62a8b113a3d59de1b16a052b72ffe14c22))
* **analytics-browser:** should send batches sequentially ([#935](https://github.com/amplitude/Amplitude-TypeScript/issues/935)) ([ad319d6](https://github.com/amplitude/Amplitude-TypeScript/commit/ad319d602d167b1db7ee3c8d07beb4c00be8c080))





## [2.5.4](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.5.3...@amplitude/analytics-core@2.5.4) (2024-11-05)


### Bug Fixes

* **analytics-types:** allow an array of objects as identity value type ([#914](https://github.com/amplitude/Amplitude-TypeScript/issues/914)) ([a6ddf9f](https://github.com/amplitude/Amplitude-TypeScript/commit/a6ddf9f369fb0240f7fe9ca7040ef36a48a65d41))





## [2.5.3](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.5.2...@amplitude/analytics-core@2.5.3) (2024-10-21)

**Note:** Version bump only for package @amplitude/analytics-core





## [2.5.2](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.5.1...@amplitude/analytics-core@2.5.2) (2024-09-17)

**Note:** Version bump only for package @amplitude/analytics-core





## [2.5.1](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.5.0...@amplitude/analytics-core@2.5.1) (2024-09-10)

**Note:** Version bump only for package @amplitude/analytics-core





# [2.5.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.4.0...@amplitude/analytics-core@2.5.0) (2024-08-13)


### Features

* support remote config for each autocapture field ([#848](https://github.com/amplitude/Amplitude-TypeScript/issues/848)) ([939d49f](https://github.com/amplitude/Amplitude-TypeScript/commit/939d49f488bda8bbe4fa57cd2a2ab23f75540fc5))





# [2.4.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.3.0...@amplitude/analytics-core@2.4.0) (2024-08-02)


### Features

* remote config ([#832](https://github.com/amplitude/Amplitude-TypeScript/issues/832)) ([c415f79](https://github.com/amplitude/Amplitude-TypeScript/commit/c415f792a98253ac60885eb1dc7e53b78ca47dcb)), closes [#769](https://github.com/amplitude/Amplitude-TypeScript/issues/769) [#772](https://github.com/amplitude/Amplitude-TypeScript/issues/772) [#780](https://github.com/amplitude/Amplitude-TypeScript/issues/780) [#782](https://github.com/amplitude/Amplitude-TypeScript/issues/782) [#811](https://github.com/amplitude/Amplitude-TypeScript/issues/811) [#828](https://github.com/amplitude/Amplitude-TypeScript/issues/828)





# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [2.3.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.2.8...@amplitude/analytics-core@2.3.0) (2024-06-17)

### Features

- **analytics-browser:** consume remote config ([#769](https://github.com/amplitude/Amplitude-TypeScript/issues/769))
  ([9c4e03c](https://github.com/amplitude/Amplitude-TypeScript/commit/9c4e03c3b3989213ac04410c8b9bf5e78ed393cf))

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [2.2.8](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.2.7...@amplitude/analytics-core@2.2.8) (2024-05-21)

**Note:** Version bump only for package @amplitude/analytics-core

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [2.2.7](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.2.6...@amplitude/analytics-core@2.2.7) (2024-05-15)

### Bug Fixes

- **core:** api calls should queue while awaiting queued promises
  ([60fe272](https://github.com/amplitude/Amplitude-TypeScript/commit/60fe272d7bc4ea20944dbf444f73fa14e4785030))
- **core:** flush queue if more functions are added while awaiting promises in queue
  ([1b7ce6d](https://github.com/amplitude/Amplitude-TypeScript/commit/1b7ce6dd36c98ac4a0d49241284d763cf56960cb))

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [2.2.6](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.2.5...@amplitude/analytics-core@2.2.6) (2024-05-03)

### Bug Fixes

- **core:** correctly await promises called before init
  ([b329e05](https://github.com/amplitude/Amplitude-TypeScript/commit/b329e057023d266abb6b1145ea45e3c3471335fc))

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [2.2.5](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.2.4...@amplitude/analytics-core@2.2.5) (2024-04-29)

### Bug Fixes

- error when sending data to Amplitude should get retried
  ([fb29785](https://github.com/amplitude/Amplitude-TypeScript/commit/fb297852288a9cd158b6171e79697e990f375a49))

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [2.2.4](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.2.4-beta.0...@amplitude/analytics-core@2.2.4) (2024-04-09)

**Note:** Version bump only for package @amplitude/analytics-core

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [2.2.4-beta.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.2.3...@amplitude/analytics-core@2.2.4-beta.0) (2024-03-28)

### Bug Fixes

- fix event drop issue ([#689](https://github.com/amplitude/Amplitude-TypeScript/issues/689))
  ([43a0ca3](https://github.com/amplitude/Amplitude-TypeScript/commit/43a0ca3e1797bdb8a74938c6a0f65d6dec1e5b89))

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [2.2.3](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.2.2...@amplitude/analytics-core@2.2.3) (2024-03-23)

### Bug Fixes

- stop accumulating bad events
  ([9fc9550](https://github.com/amplitude/Amplitude-TypeScript/commit/9fc9550c20c5693bc0322bf376cd7958d1a2154e))

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [2.2.2](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.2.1...@amplitude/analytics-core@2.2.2) (2024-03-12)

### Bug Fixes

- fix event flush process ([#673](https://github.com/amplitude/Amplitude-TypeScript/issues/673))
  ([043987f](https://github.com/amplitude/Amplitude-TypeScript/commit/043987f1382172fa5b700220b0b39f0e655514e4))

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [2.2.1](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.2.0...@amplitude/analytics-core@2.2.1) (2024-02-23)

**Note:** Version bump only for package @amplitude/analytics-core

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [2.2.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.1.3...@amplitude/analytics-core@2.2.0) (2024-01-24)

### Features

- add offline mode ([#644](https://github.com/amplitude/Amplitude-TypeScript/issues/644))
  ([f2cd717](https://github.com/amplitude/Amplitude-TypeScript/commit/f2cd717316eef66b101153cb8eedf37fadc6de0c))

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [2.1.3](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.1.2...@amplitude/analytics-core@2.1.3) (2023-12-20)

### Reverts

- update attribution plugin to apply utm params to the `session_start` event
  ([#638](https://github.com/amplitude/Amplitude-TypeScript/issues/638))
  ([c820279](https://github.com/amplitude/Amplitude-TypeScript/commit/c820279cbef2123d890beb7861d7edbbc3926f6e))

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [2.1.2](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.1.2-beta.0...@amplitude/analytics-core@2.1.2) (2023-12-01)

**Note:** Version bump only for package @amplitude/analytics-core

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [2.1.2-beta.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.1.1...@amplitude/analytics-core@2.1.2-beta.0) (2023-11-22)

### Bug Fixes

- update attribution plugin to apply utm params to the `session_start` event
  ([#619](https://github.com/amplitude/Amplitude-TypeScript/issues/619))
  ([bf45ca6](https://github.com/amplitude/Amplitude-TypeScript/commit/bf45ca6c17ac8d656cb6c5bb4f4fa19ff344ac85))

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [2.1.1](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.1.0...@amplitude/analytics-core@2.1.1) (2023-11-16)

### Bug Fixes

- npm latest tags ([#624](https://github.com/amplitude/Amplitude-TypeScript/issues/624))
  ([76bf7a4](https://github.com/amplitude/Amplitude-TypeScript/commit/76bf7a4c871375649fac45d549b711ac52c16b0d))

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [2.1.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.0.5...@amplitude/analytics-core@2.1.0) (2023-10-18)

### Features

- add client upload time ([#601](https://github.com/amplitude/Amplitude-TypeScript/issues/601))
  ([b80d090](https://github.com/amplitude/Amplitude-TypeScript/commit/b80d090c5a70f75b4d3cb653efa1af48ff2fcd34))

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [2.0.5](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.0.4...@amplitude/analytics-core@2.0.5) (2023-09-18)

**Note:** Version bump only for package @amplitude/analytics-core

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [2.0.4](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.0.3...@amplitude/analytics-core@2.0.4) (2023-08-24)

### Bug Fixes

- apply 'core' changes fom 1.x/migrate-legacy-data
  ([#531](https://github.com/amplitude/Amplitude-TypeScript/issues/531))
  ([502a080](https://github.com/amplitude/Amplitude-TypeScript/commit/502a080b6eca2bc390b5d8076f24b9137d213f89))
- **core:** allow no destination plugins on instance
  ([2c72800](https://github.com/amplitude/Amplitude-TypeScript/commit/2c728009c79116aa4fc038cd266fba830a6ca0b6))

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [2.0.3](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.0.2...@amplitude/analytics-core@2.0.3) (2023-06-30)

### Bug Fixes

- allow plugins to teardown to remove listeners ([#460](https://github.com/amplitude/Amplitude-TypeScript/issues/460))
  ([c337363](https://github.com/amplitude/Amplitude-TypeScript/commit/c337363c25b0a1285e8df455511516fc0a9bec7e))

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [2.0.2](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.0.1...@amplitude/analytics-core@2.0.2) (2023-06-22)

**Note:** Version bump only for package @amplitude/analytics-core

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [2.0.1](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.0.0...@amplitude/analytics-core@2.0.1) (2023-06-21)

**Note:** Version bump only for package @amplitude/analytics-core

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [2.0.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.0.0-beta.8...@amplitude/analytics-core@2.0.0) (2023-06-14)

**Note:** Version bump only for package @amplitude/analytics-core

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [2.0.0-beta.8](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.0.0-beta.7...@amplitude/analytics-core@2.0.0-beta.8) (2023-06-14)

**Note:** Version bump only for package @amplitude/analytics-core

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [2.0.0-beta.7](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.0.0-beta.6...@amplitude/analytics-core@2.0.0-beta.7) (2023-06-14)

**Note:** Version bump only for package @amplitude/analytics-core

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [2.0.0-beta.6](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.0.0-beta.5...@amplitude/analytics-core@2.0.0-beta.6) (2023-06-13)

### Features

- add option for instance name ([#428](https://github.com/amplitude/Amplitude-TypeScript/issues/428))
  ([1a8ff7d](https://github.com/amplitude/Amplitude-TypeScript/commit/1a8ff7d665d2a936db7cb42f4cde5350379b7cae))

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [2.0.0-beta.5](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.0.0-beta.4...@amplitude/analytics-core@2.0.0-beta.5) (2023-06-13)

### Features

- log response body from API to logger ([#415](https://github.com/amplitude/Amplitude-TypeScript/issues/415))
  ([#422](https://github.com/amplitude/Amplitude-TypeScript/issues/422))
  ([d14b5c0](https://github.com/amplitude/Amplitude-TypeScript/commit/d14b5c00a88f1a61149a61128bb4c4d07ed35836))

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [2.0.0-beta.4](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.0.0-beta.3...@amplitude/analytics-core@2.0.0-beta.4) (2023-06-08)

**Note:** Version bump only for package @amplitude/analytics-core

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [2.0.0-beta.3](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.0.0-beta.2...@amplitude/analytics-core@2.0.0-beta.3) (2023-06-07)

**Note:** Version bump only for package @amplitude/analytics-core

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [2.0.0-beta.2](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@2.0.0-beta.1...@amplitude/analytics-core@2.0.0-beta.2) (2023-06-06)

### Bug Fixes

- simplify plugins and eliminate enums ([#407](https://github.com/amplitude/Amplitude-TypeScript/issues/407))
  ([890ec66](https://github.com/amplitude/Amplitude-TypeScript/commit/890ec6695a8b25cd6988e9f7ae584d4ba2835f67))

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [2.0.0-beta.1](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.13.3...@amplitude/analytics-core@2.0.0-beta.1) (2023-06-06)

### Features

- simplify browser SDK options and plugin options interface
  ([#384](https://github.com/amplitude/Amplitude-TypeScript/issues/384))
  ([b464cfb](https://github.com/amplitude/Amplitude-TypeScript/commit/b464cfb8e09d722bf06ed3c11955f77465a23daf))

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [0.13.3](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.13.2...@amplitude/analytics-core@0.13.3) (2023-05-04)

**Note:** Version bump only for package @amplitude/analytics-core

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [0.13.2](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.13.1...@amplitude/analytics-core@0.13.2) (2023-04-27)

### Bug Fixes

- do not overwrite flushIntervalMillis=0 with default value (10 seconds)
  ([#377](https://github.com/amplitude/Amplitude-TypeScript/issues/377))
  ([02dc428](https://github.com/amplitude/Amplitude-TypeScript/commit/02dc428a5b5b453a245d893a4baaf7ef8757d7ca))

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [0.13.1](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.13.0...@amplitude/analytics-core@0.13.1) (2023-04-25)

**Note:** Version bump only for package @amplitude/analytics-core

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [0.13.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.12.1...@amplitude/analytics-core@0.13.0) (2023-04-06)

### Features

- update Plugin implementation to allow for dropping events
  ([#361](https://github.com/amplitude/Amplitude-TypeScript/issues/361))
  ([3db4d13](https://github.com/amplitude/Amplitude-TypeScript/commit/3db4d1327e87ebcf7a2a8c1d50a62e5c8bc2b418))

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [0.12.1](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.12.0...@amplitude/analytics-core@0.12.1) (2023-03-31)

**Note:** Version bump only for package @amplitude/analytics-core

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [0.12.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.12.0-beta.0...@amplitude/analytics-core@0.12.0) (2023-02-27)

**Note:** Version bump only for package @amplitude/analytics-core

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [0.12.0-beta.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.11.4...@amplitude/analytics-core@0.12.0-beta.0) (2023-02-24)

### Features

- pass amplitude instance to plugin.setup for enhanced plugin capabilities
  ([#328](https://github.com/amplitude/Amplitude-TypeScript/issues/328))
  ([91eeaa0](https://github.com/amplitude/Amplitude-TypeScript/commit/91eeaa0d6bff6bde39538bb54548a938df784462))

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [0.11.4](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.11.3...@amplitude/analytics-core@0.11.4) (2023-02-09)

**Note:** Version bump only for package @amplitude/analytics-core

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [0.11.3](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.11.3-beta.0...@amplitude/analytics-core@0.11.3) (2023-01-31)

**Note:** Version bump only for package @amplitude/analytics-core

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [0.11.3-beta.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.11.2...@amplitude/analytics-core@0.11.3-beta.0) (2023-01-26)

**Note:** Version bump only for package @amplitude/analytics-core

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [0.11.2](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.11.1...@amplitude/analytics-core@0.11.2) (2023-01-11)

### Bug Fixes

- avoid loading types node ([#301](https://github.com/amplitude/Amplitude-TypeScript/issues/301))
  ([1141807](https://github.com/amplitude/Amplitude-TypeScript/commit/1141807e77ea86423b092943dbbe357813967bd0))

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [0.11.1](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.11.0...@amplitude/analytics-core@0.11.1) (2022-12-21)

### Bug Fixes

- upgrade dependencies to resolve dependabot vulnerability alerts
  ([#299](https://github.com/amplitude/Amplitude-TypeScript/issues/299))
  ([7dd1cd1](https://github.com/amplitude/Amplitude-TypeScript/commit/7dd1cd1b23a71981a4ad90b4b30cc9b7d28c4412))

### Reverts

- Revert "Updated dependencies"
  ([7ca9964](https://github.com/amplitude/Amplitude-TypeScript/commit/7ca9964781e4b900c6c027bdddf2ae1e7428ba18))

# [0.11.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.10.1...@amplitude/analytics-core@0.11.0) (2022-11-28)

### Features

- add nest.js example app and improve response message with body content
  ([#275](https://github.com/amplitude/Amplitude-TypeScript/issues/275))
  ([1379195](https://github.com/amplitude/Amplitude-TypeScript/commit/1379195677af0120a09cdf632c3bae36baa4fd1c))

## [0.10.1](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.10.0...@amplitude/analytics-core@0.10.1) (2022-11-15)

### Bug Fixes

- clear open timeouts when flush is called
  ([0cebcb7](https://github.com/amplitude/Amplitude-TypeScript/commit/0cebcb72d10de9c4af8c6665a098434b511a6de1))
- clear open timeouts when flush is called
  ([f404100](https://github.com/amplitude/Amplitude-TypeScript/commit/f4041003a6024875b9fe03806d487382d7f044d4))

# [0.10.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.9.7...@amplitude/analytics-core@0.10.0) (2022-11-01)

### Features

- enhance logger with debug information ([#254](https://github.com/amplitude/Amplitude-TypeScript/issues/254))
  ([5c6175e](https://github.com/amplitude/Amplitude-TypeScript/commit/5c6175e9372cbeea264ddb34c6cc68148063d4f7))

## [0.9.7](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.9.6...@amplitude/analytics-core@0.9.7) (2022-10-25)

### Bug Fixes

- invoke pre-init track fns after attribution ([#253](https://github.com/amplitude/Amplitude-TypeScript/issues/253))
  ([b8996d7](https://github.com/amplitude/Amplitude-TypeScript/commit/b8996d793f74d388c1a96e0cde5c0ac060c1e565))

## [0.9.6](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.9.5...@amplitude/analytics-core@0.9.6) (2022-10-14)

### Bug Fixes

- run queued functions after attribution in browser-client.ts
  ([#249](https://github.com/amplitude/Amplitude-TypeScript/issues/249))
  ([751b7ca](https://github.com/amplitude/Amplitude-TypeScript/commit/751b7ca6b0f05131dc932b89dd89e8979e334b4b))

## [0.9.5](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.9.4...@amplitude/analytics-core@0.9.5) (2022-10-04)

**Note:** Version bump only for package @amplitude/analytics-core

## [0.9.4](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.9.4-beta.0...@amplitude/analytics-core@0.9.4) (2022-09-28)

**Note:** Version bump only for package @amplitude/analytics-core

## [0.9.4-beta.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.9.3...@amplitude/analytics-core@0.9.4-beta.0) (2022-09-26)

**Note:** Version bump only for package @amplitude/analytics-core

## [0.9.3](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.9.2...@amplitude/analytics-core@0.9.3) (2022-09-26)

**Note:** Version bump only for package @amplitude/analytics-core

## [0.9.2](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.9.1...@amplitude/analytics-core@0.9.2) (2022-09-22)

**Note:** Version bump only for package @amplitude/analytics-core

## [0.9.1](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.9.0...@amplitude/analytics-core@0.9.1) (2022-09-16)

**Note:** Version bump only for package @amplitude/analytics-core

# [0.9.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.8.1...@amplitude/analytics-core@0.9.0) (2022-09-08)

### Features

- add ingestion_metadata field ([#212](https://github.com/amplitude/Amplitude-TypeScript/issues/212))
  ([ebe8448](https://github.com/amplitude/Amplitude-TypeScript/commit/ebe8448b23609134f846e18da2e769158ca30bf1))

## [0.8.1](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.8.0...@amplitude/analytics-core@0.8.1) (2022-08-31)

**Note:** Version bump only for package @amplitude/analytics-core

# [0.8.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.7.0...@amplitude/analytics-core@0.8.0) (2022-08-18)

### Bug Fixes

- prevent concurrent init calls ([#191](https://github.com/amplitude/Amplitude-TypeScript/issues/191))
  ([efda076](https://github.com/amplitude/Amplitude-TypeScript/commit/efda0760f4f1e92e47a3150985e18efcc3b108d9))

### Features

- adds create instance api ([#188](https://github.com/amplitude/Amplitude-TypeScript/issues/188))
  ([050c1d9](https://github.com/amplitude/Amplitude-TypeScript/commit/050c1d96cedbc9e68aedf6fd55e85d2d3dc2fee4))

# [0.7.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.6.6...@amplitude/analytics-core@0.7.0) (2022-08-16)

### Bug Fixes

- add event options to setGroup
  ([6ee19e2](https://github.com/amplitude/Amplitude-TypeScript/commit/6ee19e2abb326a687e6e43ecb95fe84adf35a8ce))

### Features

- add 'extra' to eventOptions ([#186](https://github.com/amplitude/Amplitude-TypeScript/issues/186))
  ([32266f4](https://github.com/amplitude/Amplitude-TypeScript/commit/32266f459c180b75236d036bac66c3e7ecd33920))

## [0.6.6](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.6.5...@amplitude/analytics-core@0.6.6) (2022-08-13)

**Note:** Version bump only for package @amplitude/analytics-core

## [0.6.5](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.6.4...@amplitude/analytics-core@0.6.5) (2022-08-12)

### Bug Fixes

- add callable queue when init is pending ([#181](https://github.com/amplitude/Amplitude-TypeScript/issues/181))
  ([d8fc361](https://github.com/amplitude/Amplitude-TypeScript/commit/d8fc36195b96e2c10ccc5106027beaa7e970e0c0))

## [0.6.4](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.6.3...@amplitude/analytics-core@0.6.4) (2022-07-22)

### Bug Fixes

- adds error handling for invalid api ([#153](https://github.com/amplitude/Amplitude-TypeScript/issues/153))
  ([c03f9d7](https://github.com/amplitude/Amplitude-TypeScript/commit/c03f9d7dad51e3026673dca31418a74591d79bbc))
- allow undefined storage provider ([#146](https://github.com/amplitude/Amplitude-TypeScript/issues/146))
  ([e704342](https://github.com/amplitude/Amplitude-TypeScript/commit/e704342761c8ad7de3921ba21901ef8d3a768188))
- missing tracked events before init issue ([#144](https://github.com/amplitude/Amplitude-TypeScript/issues/144))
  ([60d0f68](https://github.com/amplitude/Amplitude-TypeScript/commit/60d0f6848087f7b8fc3c870d55489a238e841b26))
- removes saveEvents config ([#147](https://github.com/amplitude/Amplitude-TypeScript/issues/147))
  ([6fde736](https://github.com/amplitude/Amplitude-TypeScript/commit/6fde736ca8a865462522082a8085673756dbcc7d))
- update default flush config for node ([#152](https://github.com/amplitude/Amplitude-TypeScript/issues/152))
  ([2445dff](https://github.com/amplitude/Amplitude-TypeScript/commit/2445dff0842e7e0a2b7ee767ab926b5a93348214))

## [0.6.3](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.6.2...@amplitude/analytics-core@0.6.3) (2022-07-15)

**Note:** Version bump only for package @amplitude/analytics-core

## [0.6.2](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.6.1...@amplitude/analytics-core@0.6.2) (2022-07-13)

### Bug Fixes

- handle error gracefully when identify is set with null
  ([#138](https://github.com/amplitude/Amplitude-TypeScript/issues/138))
  ([e0458d1](https://github.com/amplitude/Amplitude-TypeScript/commit/e0458d1256d2a96195bc8029c3df0d6ac257a588))

## [0.6.1](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.6.0...@amplitude/analytics-core@0.6.1) (2022-06-29)

### Bug Fixes

- remove Awaited type to support older versions of typescript
  ([#121](https://github.com/amplitude/Amplitude-TypeScript/issues/121))
  ([23d36f8](https://github.com/amplitude/Amplitude-TypeScript/commit/23d36f8aade258b995132dafd725ada00e400916))

# [0.6.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.5.0...@amplitude/analytics-core@0.6.0) (2022-06-29)

### Features

- add flush() api to send all events immediately ([#125](https://github.com/amplitude/Amplitude-TypeScript/issues/125))
  ([b5dbcbb](https://github.com/amplitude/Amplitude-TypeScript/commit/b5dbcbb803c76ee5ade7ea85f76fbea50d8bab49))
- make storage interface async to enable react-native
  ([#122](https://github.com/amplitude/Amplitude-TypeScript/issues/122))
  ([42bb39c](https://github.com/amplitude/Amplitude-TypeScript/commit/42bb39c967db015d5899487618d066f3540c9f18))

# [0.5.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.4.1...@amplitude/analytics-core@0.5.0) (2022-06-24)

### Features

- add marketing campaign tracking ([#112](https://github.com/amplitude/Amplitude-TypeScript/issues/112))
  ([bca73ed](https://github.com/amplitude/Amplitude-TypeScript/commit/bca73ede308ecb1663986a99600657732969d60c))

## [0.4.1](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.4.0...@amplitude/analytics-core@0.4.1) (2022-06-21)

### Bug Fixes

- remove userId and deviceId from createIdentifyEvent and createGroupIdentifyEvent
  ([#119](https://github.com/amplitude/Amplitude-TypeScript/issues/119))
  ([e7726bb](https://github.com/amplitude/Amplitude-TypeScript/commit/e7726bb9ba16c390638b51042169ede9e083e331))

# [0.4.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.3.1...@amplitude/analytics-core@0.4.0) (2022-06-17)

### Features

- add event bridge components ([#93](https://github.com/amplitude/Amplitude-TypeScript/issues/93))
  ([64452fc](https://github.com/amplitude/Amplitude-TypeScript/commit/64452fcfeee66e10367220da023137232b2ea112))
- add Plan option to config ([#117](https://github.com/amplitude/Amplitude-TypeScript/issues/117))
  ([194d7e6](https://github.com/amplitude/Amplitude-TypeScript/commit/194d7e66af0209cb8155cf6aa0b05a5dcb170f9d))
- introduce NodeJS package ([#92](https://github.com/amplitude/Amplitude-TypeScript/issues/92))
  ([476fb44](https://github.com/amplitude/Amplitude-TypeScript/commit/476fb44efcf2dfcd84af6f0ef45e141ad87dac43))

## [0.3.1](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.3.0...@amplitude/analytics-core@0.3.1) (2022-05-17)

### Bug Fixes

- allow min_id_length option in http payload ([#99](https://github.com/amplitude/Amplitude-TypeScript/issues/99))
  ([85ec965](https://github.com/amplitude/Amplitude-TypeScript/commit/85ec965d1202f8ee68ca15fbc46015fba76ba3c9))
- allow option.serverUrl to be used in destination plugin
  ([#104](https://github.com/amplitude/Amplitude-TypeScript/issues/104))
  ([f353367](https://github.com/amplitude/Amplitude-TypeScript/commit/f353367b8b264f86b6ea15b15f30385f8d5b8ad5))

# [0.3.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.2.4...@amplitude/analytics-core@0.3.0) (2022-05-12)

### Bug Fixes

- allow event level groups tracking ([#90](https://github.com/amplitude/Amplitude-TypeScript/issues/90))
  ([3240660](https://github.com/amplitude/Amplitude-TypeScript/commit/3240660e94db9e5c5a1ce4280d07faced2b5fd4d))
- fix early return if array element is a valid object
  ([#95](https://github.com/amplitude/Amplitude-TypeScript/issues/95))
  ([2a82b37](https://github.com/amplitude/Amplitude-TypeScript/commit/2a82b37ec06573318703f3f89d72b44a10b7a392))
- handle 400 error with invalid id lengths ([#81](https://github.com/amplitude/Amplitude-TypeScript/issues/81))
  ([fd1686f](https://github.com/amplitude/Amplitude-TypeScript/commit/fd1686fa427588d1dcb6d2125cb4d53647c699e8))

### Features

- parse old cookies and convert to new format ([#85](https://github.com/amplitude/Amplitude-TypeScript/issues/85))
  ([bda78be](https://github.com/amplitude/Amplitude-TypeScript/commit/bda78be5d2de335e7b1ff6da413b20d3dc751aca))

## [0.2.4](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.2.3...@amplitude/analytics-core@0.2.4) (2022-04-09)

### Bug Fixes

- fix error handling in fetch client ([#79](https://github.com/amplitude/Amplitude-TypeScript/issues/79))
  ([749925f](https://github.com/amplitude/Amplitude-TypeScript/commit/749925f907ba72f0e67f3828da99151d00278e6b))

## [0.2.3](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.2.2...@amplitude/analytics-core@0.2.3) (2022-04-02)

**Note:** Version bump only for package @amplitude/analytics-core

## [0.2.2](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.2.1...@amplitude/analytics-core@0.2.2) (2022-04-01)

**Note:** Version bump only for package @amplitude/analytics-core

## [0.2.1](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.2.0...@amplitude/analytics-core@0.2.1) (2022-04-01)

**Note:** Version bump only for package @amplitude/analytics-core

# [0.2.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.1.1...@amplitude/analytics-core@0.2.0) (2022-04-01)

### Bug Fixes

- context plugin library version
  ([8d29c6f](https://github.com/amplitude/Amplitude-TypeScript/commit/8d29c6f4a612510188d920ac243c0bdb116fe02c))

### Features

- add snippet promise support ([#64](https://github.com/amplitude/Amplitude-TypeScript/issues/64))
  ([4d23c98](https://github.com/amplitude/Amplitude-TypeScript/commit/4d23c98c25c7caa4cd5e63b2a37398f711991288))

## [0.1.1](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.1.0...@amplitude/analytics-core@0.1.1) (2022-03-31)

### Bug Fixes

- add missing dependency
  ([6283f64](https://github.com/amplitude/Amplitude-TypeScript/commit/6283f64dc40b070d68a0243a93ab58d95d436664))

# 0.1.0 (2022-03-31)

### Bug Fixes

- add log message ([#44](https://github.com/amplitude/Amplitude-TypeScript/issues/44))
  ([92325bc](https://github.com/amplitude/Amplitude-TypeScript/commit/92325bc34cf0143f5f33ec4b0afd3e2d148c3d38))
- couple plugins with config instance ([#43](https://github.com/amplitude/Amplitude-TypeScript/issues/43))
  ([abf687a](https://github.com/amplitude/Amplitude-TypeScript/commit/abf687a5d7a395638d8154f65ececc9b5464c366))
- max retry limit ([#53](https://github.com/amplitude/Amplitude-TypeScript/issues/53))
  ([fdc0391](https://github.com/amplitude/Amplitude-TypeScript/commit/fdc0391885ac9822f42324d2fd66a8aace001afe))
- update event results callback parameter ([#29](https://github.com/amplitude/Amplitude-TypeScript/issues/29))
  ([1acd3c0](https://github.com/amplitude/Amplitude-TypeScript/commit/1acd3c02310e5e9a2b7ab19140f7d6249e9a8452))
- update logger config to logger provider ([#19](https://github.com/amplitude/Amplitude-TypeScript/issues/19))
  ([ef89d9f](https://github.com/amplitude/Amplitude-TypeScript/commit/ef89d9f5ffdc9dd88c3652ac36705c79741f53d1))
- use config reference as plugin instance property ([#21](https://github.com/amplitude/Amplitude-TypeScript/issues/21))
  ([38c2e33](https://github.com/amplitude/Amplitude-TypeScript/commit/38c2e3334b27063e23275c020207f647acbbaf6f))

### Features

- add amplitude built-in plugins ([#22](https://github.com/amplitude/Amplitude-TypeScript/issues/22))
  ([443a424](https://github.com/amplitude/Amplitude-TypeScript/commit/443a424d6dfd3a2c867f528f953429151de96ed0))
- add context plugin ([#13](https://github.com/amplitude/Amplitude-TypeScript/issues/13))
  ([3d63991](https://github.com/amplitude/Amplitude-TypeScript/commit/3d639917905b25cab0bb012286b8ba487d0f63fb))
- add EU and batch endpoint support ([#50](https://github.com/amplitude/Amplitude-TypeScript/issues/50))
  ([af6be60](https://github.com/amplitude/Amplitude-TypeScript/commit/af6be606a0e049657129ddbcbbf83c3dff844443))
- add getter and setter for config and group ([#45](https://github.com/amplitude/Amplitude-TypeScript/issues/45))
  ([60e0073](https://github.com/amplitude/Amplitude-TypeScript/commit/60e00734a73002dffc98ddf6171ee74c5ac53aa4))
- add identify class and handle identify logging ([#10](https://github.com/amplitude/Amplitude-TypeScript/issues/10))
  ([9075b1f](https://github.com/amplitude/Amplitude-TypeScript/commit/9075b1f0cf4270dacc05b1b7f4bad36c50e2500b))
- add partner_id in event options ([#38](https://github.com/amplitude/Amplitude-TypeScript/issues/38))
  ([880fe57](https://github.com/amplitude/Amplitude-TypeScript/commit/880fe57e5813d8bbe05c2a2a9428bd8a0a1e7d08))
- add serverZone check while calling getApiHost ([#51](https://github.com/amplitude/Amplitude-TypeScript/issues/51))
  ([fa3014d](https://github.com/amplitude/Amplitude-TypeScript/commit/fa3014dd730e624b6320769edbdf35350d0edc3d))
- adds default logger provider ([#14](https://github.com/amplitude/Amplitude-TypeScript/issues/14))
  ([c5c3d62](https://github.com/amplitude/Amplitude-TypeScript/commit/c5c3d62cf505e3df949a4225e3fa3ae2b56d5a0a))
- adds group identify api ([#18](https://github.com/amplitude/Amplitude-TypeScript/issues/18))
  ([8871527](https://github.com/amplitude/Amplitude-TypeScript/commit/8871527fb74d0f5745c57a053492a00d19a68c5a))
- adds session management ([#15](https://github.com/amplitude/Amplitude-TypeScript/issues/15))
  ([e23a563](https://github.com/amplitude/Amplitude-TypeScript/commit/e23a563c27befa5a3dc31ee55c559359e0159de3))
- analytics core initialization ([#2](https://github.com/amplitude/Amplitude-TypeScript/issues/2))
  ([7ba8a7b](https://github.com/amplitude/Amplitude-TypeScript/commit/7ba8a7b1e9b7dfc0af304dd44718a3deb5912fe9))
- browser init config ([#6](https://github.com/amplitude/Amplitude-TypeScript/issues/6))
  ([c5a0992](https://github.com/amplitude/Amplitude-TypeScript/commit/c5a09925e64f8a613eeab612ee6efb43419f39b4))
- core timeline implementation ([#3](https://github.com/amplitude/Amplitude-TypeScript/issues/3))
  ([ac8bc3a](https://github.com/amplitude/Amplitude-TypeScript/commit/ac8bc3a7212c4e13240fca0da1fbca2cdf7d68c2))
- create browser folder structure ([#5](https://github.com/amplitude/Amplitude-TypeScript/issues/5))
  ([b1b279d](https://github.com/amplitude/Amplitude-TypeScript/commit/b1b279da067af7a5ca0c797b4f45fc154e3c2ae4))
- create cookie/events storage providers ([#7](https://github.com/amplitude/Amplitude-TypeScript/issues/7))
  ([b3d6fab](https://github.com/amplitude/Amplitude-TypeScript/commit/b3d6fab5239d0d14854af9aa8a0c31826447ac48))
- create transport providers (fetch/xhr/sendBeacon) ([#8](https://github.com/amplitude/Amplitude-TypeScript/issues/8))
  ([5ad3477](https://github.com/amplitude/Amplitude-TypeScript/commit/5ad3477974c779d696088922f56cae38a89f911c))
- implement revenue ([#12](https://github.com/amplitude/Amplitude-TypeScript/issues/12))
  ([dafd10e](https://github.com/amplitude/Amplitude-TypeScript/commit/dafd10e9feb84513bdcd415a965e3216b044206a))
- implement save events to storage on destination plugin
  ([#26](https://github.com/amplitude/Amplitude-TypeScript/issues/26))
  ([5f47677](https://github.com/amplitude/Amplitude-TypeScript/commit/5f476773f0a546db15de45fc40725a138a037c97))
- implemented destination plugin with retry ([#4](https://github.com/amplitude/Amplitude-TypeScript/issues/4))
  ([f4f085e](https://github.com/amplitude/Amplitude-TypeScript/commit/f4f085ed343ea3a0571c778f2d40d637573817d7))
- implements optOut config ([#30](https://github.com/amplitude/Amplitude-TypeScript/issues/30))
  ([bdf1eb0](https://github.com/amplitude/Amplitude-TypeScript/commit/bdf1eb0c46f535947f66162639dd0b23f154ce28))
- improve browser config logic ([#56](https://github.com/amplitude/Amplitude-TypeScript/issues/56))
  ([3054c68](https://github.com/amplitude/Amplitude-TypeScript/commit/3054c6856dd8f8ed49c9326f25c14b672890915b))
- update track event ([#25](https://github.com/amplitude/Amplitude-TypeScript/issues/25))
  ([bcccd65](https://github.com/amplitude/Amplitude-TypeScript/commit/bcccd659f83bd235ce7cb59848e259e14e1df392))
