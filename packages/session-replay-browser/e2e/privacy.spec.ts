import { test, expect } from '@playwright/test';
import {
  TEST_SESSION_ID,
  SNAPSHOT_SETTLE_MS,
  remoteConfigRecording,
  mockRemoteConfig,
  buildUrl,
  waitForReady,
  captureTrackRequests,
  flushRecording,
  getSnapshotRoot,
  findById,
  getTextContent,
  isMaskedText,
} from './helpers';

function remoteConfigWithPrivacy(privacy: object) {
  return {
    configs: {
      sessionReplay: {
        sr_sampling_config: { capture_enabled: true, sample_rate: 1.0 },
        sr_privacy_config: privacy,
      },
    },
  };
}

const PRIVACY_PAGE = '/session-replay-browser/sr-privacy-test.html';

// ─── CSS class-based privacy ──────────────────────────────────────────────────

test.describe('privacy — CSS classes', () => {
  test('amp-block class removes element from the snapshot entirely', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigRecording);
    const getBodies = await captureTrackRequests(page);

    await page.goto(buildUrl(PRIVACY_PAGE, { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
    await flushRecording(page);

    const root = getSnapshotRoot(getBodies());
    expect(root).not.toBeNull();

    // rrweb removes blocked elements from the serialized tree entirely
    expect(findById(root!, 'amp-block-element')).toBeUndefined();
  });

  test('amp-mask class replaces text content with asterisks in the snapshot', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigRecording);
    const getBodies = await captureTrackRequests(page);

    await page.goto(buildUrl(PRIVACY_PAGE, { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
    await flushRecording(page);

    const root = getSnapshotRoot(getBodies());
    expect(root).not.toBeNull();

    const el = findById(root!, 'amp-mask-text');
    expect(el).toBeDefined();
    expect(isMaskedText(getTextContent(el!))).toBe(true);
  });
});

// ─── privacyConfig option ─────────────────────────────────────────────────────

test.describe('privacy — privacyConfig option', () => {
  test('blockSelector removes matching element from the snapshot entirely', async ({ page }) => {
    const privacyConfig = JSON.stringify({ blockSelector: ['#selector-blocked'] });
    await mockRemoteConfig(page, remoteConfigRecording);
    const getBodies = await captureTrackRequests(page);

    await page.goto(buildUrl(PRIVACY_PAGE, { sessionId: TEST_SESSION_ID, privacyConfig }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
    await flushRecording(page);

    const root = getSnapshotRoot(getBodies());
    expect(root).not.toBeNull();

    // rrweb removes selector-blocked elements from the serialized tree entirely
    expect(findById(root!, 'selector-blocked')).toBeUndefined();
  });

  test('defaultMaskLevel conservative masks plain text content', async ({ page }) => {
    const privacyConfig = JSON.stringify({ defaultMaskLevel: 'conservative' });
    await mockRemoteConfig(page, remoteConfigRecording);
    const getBodies = await captureTrackRequests(page);

    await page.goto(buildUrl(PRIVACY_PAGE, { sessionId: TEST_SESSION_ID, privacyConfig }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
    await flushRecording(page);

    const root = getSnapshotRoot(getBodies());
    expect(root).not.toBeNull();

    // Under conservative mode, even plain unhinted text is masked
    const el = findById(root!, 'plain-text');
    expect(el).toBeDefined();
    expect(isMaskedText(getTextContent(el!))).toBe(true);
  });

  test('defaultMaskLevel light does not mask plain text input values', async ({ page }) => {
    const privacyConfig = JSON.stringify({ defaultMaskLevel: 'light' });
    await mockRemoteConfig(page, remoteConfigRecording);
    const getBodies = await captureTrackRequests(page);

    await page.goto(buildUrl(PRIVACY_PAGE, { sessionId: TEST_SESSION_ID, privacyConfig }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
    await flushRecording(page);

    const root = getSnapshotRoot(getBodies());
    expect(root).not.toBeNull();

    // Under light mode, a plain text input is NOT masked (only sensitive types are)
    const textInput = findById(root!, 'text-input');
    expect(textInput).toBeDefined();
    const value = String(textInput!.attributes?.value ?? '');
    expect(value).toBe('visible input value');
    expect(isMaskedText(value)).toBe(false);
  });

  test('defaultMaskLevel light still masks password input values', async ({ page }) => {
    const privacyConfig = JSON.stringify({ defaultMaskLevel: 'light' });
    await mockRemoteConfig(page, remoteConfigRecording);
    const getBodies = await captureTrackRequests(page);

    await page.goto(buildUrl(PRIVACY_PAGE, { sessionId: TEST_SESSION_ID, privacyConfig }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
    await flushRecording(page);

    const root = getSnapshotRoot(getBodies());
    expect(root).not.toBeNull();

    // Under light mode, password inputs are still masked (they are sensitive)
    const passwordInput = findById(root!, 'password-input');
    expect(passwordInput).toBeDefined();
    const value = String(passwordInput!.attributes?.value ?? '');
    expect(isMaskedText(value)).toBe(true);
  });

  test('unmaskSelector overrides conservative masking for a specific element', async ({ page }) => {
    // defaultMaskLevel:'conservative' routes masking through maskTextFn (via maskTextSelector:'*').
    // unmaskSelector can override this for specific elements. Note: amp-mask CSS class masking is
    // applied natively by rrweb before maskTextFn is called and cannot be overridden this way.
    const privacyConfig = JSON.stringify({
      defaultMaskLevel: 'conservative',
      unmaskSelector: ['#plain-text'],
    });
    await mockRemoteConfig(page, remoteConfigRecording);
    const getBodies = await captureTrackRequests(page);

    await page.goto(buildUrl(PRIVACY_PAGE, { sessionId: TEST_SESSION_ID, privacyConfig }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
    await flushRecording(page);

    const root = getSnapshotRoot(getBodies());
    expect(root).not.toBeNull();

    // #plain-text is in unmaskSelector — its text should be visible
    const plainEl = findById(root!, 'plain-text');
    expect(plainEl).toBeDefined();
    expect(getTextContent(plainEl!)).toContain('Hello visible world');
    expect(isMaskedText(getTextContent(plainEl!))).toBe(false);

    // amp-mask-text is NOT in unmaskSelector — its text should still be masked
    const maskedEl = findById(root!, 'amp-mask-text');
    expect(maskedEl).toBeDefined();
    expect(isMaskedText(getTextContent(maskedEl!))).toBe(true);
  });
});

// ─── amp-unmask CSS class (SR-2945) ──────────────────────────────────────────

test.describe('privacy — amp-unmask CSS class', () => {
  test('amp-unmask class unmasks text under conservative masking from remote config without explicit unmaskSelector', async ({
    page,
  }) => {
    // Before SR-2945, .amp-unmask had no effect unless the user explicitly added
    // '.amp-unmask' to privacyConfig.unmaskSelector. Now it's wired as a default.
    await mockRemoteConfig(page, remoteConfigWithPrivacy({ defaultMaskLevel: 'conservative' }));
    const getBodies = await captureTrackRequests(page);

    // No local privacyConfig — masking comes entirely from remote config
    await page.goto(buildUrl(PRIVACY_PAGE, { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
    await flushRecording(page);

    const root = getSnapshotRoot(getBodies());
    expect(root).not.toBeNull();

    // #amp-unmask-text has the .amp-unmask class — should NOT be masked
    const unmaskEl = findById(root!, 'amp-unmask-text');
    expect(unmaskEl).toBeDefined();
    expect(getTextContent(unmaskEl!)).toContain('Unmask class visible text');
    expect(isMaskedText(getTextContent(unmaskEl!))).toBe(false);

    // #plain-text has no special class — should be masked under conservative
    const plainEl = findById(root!, 'plain-text');
    expect(plainEl).toBeDefined();
    expect(isMaskedText(getTextContent(plainEl!))).toBe(true);
  });

  test('amp-unmask class unmasks text under conservative masking from local privacyConfig without explicit unmaskSelector', async ({
    page,
  }) => {
    const privacyConfig = JSON.stringify({ defaultMaskLevel: 'conservative' });
    await mockRemoteConfig(page, remoteConfigRecording);
    const getBodies = await captureTrackRequests(page);

    await page.goto(buildUrl(PRIVACY_PAGE, { sessionId: TEST_SESSION_ID, privacyConfig }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
    await flushRecording(page);

    const root = getSnapshotRoot(getBodies());
    expect(root).not.toBeNull();

    // #amp-unmask-text has the .amp-unmask class — should NOT be masked
    const unmaskEl = findById(root!, 'amp-unmask-text');
    expect(unmaskEl).toBeDefined();
    expect(getTextContent(unmaskEl!)).toContain('Unmask class visible text');
    expect(isMaskedText(getTextContent(unmaskEl!))).toBe(false);

    // #plain-text has no special class — should be masked under conservative
    const plainEl = findById(root!, 'plain-text');
    expect(plainEl).toBeDefined();
    expect(isMaskedText(getTextContent(plainEl!))).toBe(true);
  });
});

// ─── Remote privacy config ────────────────────────────────────────────────────

test.describe('privacy — remote sr_privacy_config', () => {
  test('sr_privacy_config in remote config applies masking to plain text', async ({ page }) => {
    // No local privacyConfig — masking comes entirely from remote config
    await mockRemoteConfig(page, remoteConfigWithPrivacy({ defaultMaskLevel: 'conservative' }));
    const getBodies = await captureTrackRequests(page);

    await page.goto(buildUrl(PRIVACY_PAGE, { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
    await flushRecording(page);

    const root = getSnapshotRoot(getBodies());
    expect(root).not.toBeNull();

    const el = findById(root!, 'plain-text');
    expect(el).toBeDefined();
    expect(isMaskedText(getTextContent(el!))).toBe(true);
  });
});
