const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { getReleaseGroups } = require('./publish-phase');

test('the direct publish phases exclude the dual-use plugin and wait for its dependents', () => {
  const groups = getReleaseGroups(path.resolve(__dirname, '../../packages'));
  assert.ok(groups.independent.includes('@amplitude/analytics-core'));
  assert.ok(groups.dependent.includes('@amplitude/analytics-browser'));
  assert.ok(groups.dependent.includes('@amplitude/unified'));
  assert.ok(!groups.independent.includes('@amplitude/plugin-custom-enrichment-browser'));
  assert.ok(!groups.dependent.includes('@amplitude/plugin-custom-enrichment-browser'));
  assert.deepEqual(
    new Set([...groups.independent, ...groups.dependent]).size,
    groups.independent.length + groups.dependent.length,
  );
});
