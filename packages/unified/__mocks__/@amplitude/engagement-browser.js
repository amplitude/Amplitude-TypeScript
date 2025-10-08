// Manual mock for @amplitude/engagement-browser
// This prevents the engagement plugin from loading external scripts during tests.
// The engagement plugin loads external scripts from a CDN during initialization,
// which causes issues in jsdom test environment:
// 1. jsdom doesn't actually fetch/execute external scripts
// 2. Script onload events never fire, causing promises to hang indefinitely
// 3. Tests would timeout waiting for initialization that never completes
// This mock provides a simple plugin interface that resolves immediately.

module.exports = {
    plugin: jest.fn(() => ({
        name: '@amplitude/engagement-plugin',
        type: 'enrichment',
        setup: jest.fn().mockResolvedValue(undefined),
        execute: jest.fn().mockResolvedValue(undefined),
    })),
};
