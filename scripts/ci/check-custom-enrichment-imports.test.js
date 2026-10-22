const assert = require('node:assert/strict');
const { test } = require('node:test');
const { checkSource } = require('./check-custom-enrichment-imports');

for (const source of [
  "import type { Event } from '@amplitude/analytics-core';",
  "import { type Event } from '@amplitude/analytics-core';",
  "import type * as Core from '@amplitude/analytics-core';",
  "export type { Event } from '@amplitude/analytics-core';",
  "export { type Event } from '@amplitude/analytics-core';",
  "type Event = import('@amplitude/analytics-core').Event;",
  "// import { runtime } from '@amplitude/analytics-core';",
  "import { runtime } from 'another-package';",
]) {
  test(`allows ${source}`, () => assert.deepEqual(checkSource(source), []));
}
for (const source of [
  "import { Event } from '@amplitude/analytics-core';",
  "import { type Event, runtime } from '@amplitude/analytics-core';",
  "import Core from '@amplitude/analytics-core';",
  "import * as Core from '@amplitude/analytics-core';",
  "import '@amplitude/analytics-core';",
  "import {} from '@amplitude/analytics-core';",
  "export { runtime } from '@amplitude/analytics-core';",
  "export * from '@amplitude/analytics-core';",
  "export { type Event, runtime } from '@amplitude/analytics-core';",
  "const core = require('@amplitude/analytics-core');",
  "const core = import('@amplitude/analytics-core');",
  "import core = require('@amplitude/analytics-core');",
  "import { runtime } from '@amplitude/analytics-core/lib/esm';",
]) {
  test(`rejects ${source}`, () => assert.equal(checkSource(source).length, 1));
}
