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
  getLastSnapshotRoot,
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
    const { getBodies } = await captureTrackRequests(page);

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
    const { getBodies } = await captureTrackRequests(page);

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
    const { getBodies } = await captureTrackRequests(page);

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
    const { getBodies } = await captureTrackRequests(page);

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
    const { getBodies } = await captureTrackRequests(page);

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
    const { getBodies } = await captureTrackRequests(page);

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
    const { getBodies } = await captureTrackRequests(page);

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

// ─── Remote privacy config ────────────────────────────────────────────────────

test.describe('privacy — remote sr_privacy_config', () => {
  test('sr_privacy_config in remote config applies masking to plain text', async ({ page }) => {
    // No local privacyConfig — masking comes entirely from remote config
    await mockRemoteConfig(page, remoteConfigWithPrivacy({ defaultMaskLevel: 'conservative' }));
    const { getBodies } = await captureTrackRequests(page);

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

// ─── urlMaskLevels — page-level masking overrides ─────────────────────────────
//
// The test page runs at http://localhost:5173/session-replay-browser/sr-privacy-test.html
// Glob patterns are anchored full-URL matches (globToRegex wraps with ^...$).

test.describe('privacy — urlMaskLevels (page-level masking)', () => {
  // Pattern that matches the test page URL.
  const MATCHING_PATTERN = 'http://localhost:5173/session-replay-browser/*';
  // Pattern that does NOT match the test page URL.
  const NON_MATCHING_PATTERN = 'http://localhost:5173/other-page/*';

  test('URL matches rule with conservative → plain text is masked', async ({ page }) => {
    // defaultMaskLevel is left at its default (medium) — the urlMaskLevels rule
    // overrides it to conservative for this specific page.
    await mockRemoteConfig(
      page,
      remoteConfigWithPrivacy({
        urlMaskLevels: [{ match: MATCHING_PATTERN, maskLevel: 'conservative' }],
      }),
    );
    const { getBodies } = await captureTrackRequests(page);

    await page.goto(buildUrl(PRIVACY_PAGE, { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
    await flushRecording(page);

    const root = getSnapshotRoot(getBodies());
    expect(root).not.toBeNull();

    // conservative mode masks all plain text
    const el = findById(root!, 'plain-text');
    expect(el).toBeDefined();
    expect(isMaskedText(getTextContent(el!))).toBe(true);
  });

  test('URL matches rule with light → plain text input is not masked', async ({ page }) => {
    // defaultMaskLevel is left at its default (medium) — the urlMaskLevels rule
    // overrides it to light for this specific page.
    await mockRemoteConfig(
      page,
      remoteConfigWithPrivacy({
        urlMaskLevels: [{ match: MATCHING_PATTERN, maskLevel: 'light' }],
      }),
    );
    const { getBodies } = await captureTrackRequests(page);

    await page.goto(buildUrl(PRIVACY_PAGE, { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
    await flushRecording(page);

    const root = getSnapshotRoot(getBodies());
    expect(root).not.toBeNull();

    // light mode does NOT mask plain text inputs
    const textInput = findById(root!, 'text-input');
    expect(textInput).toBeDefined();
    const value = String(textInput!.attributes?.value ?? '');
    expect(value).toBe('visible input value');
    expect(isMaskedText(value)).toBe(false);
  });

  test('URL does not match any rule → defaultMaskLevel (light) applies to plain text input', async ({ page }) => {
    // The urlMaskLevels rule targets a different page, so it never fires.
    // defaultMaskLevel is 'light': plain text inputs are NOT masked, but password
    // inputs remain masked. This distinguishes light from the no-match-at-all case.
    await mockRemoteConfig(
      page,
      remoteConfigWithPrivacy({
        defaultMaskLevel: 'light',
        urlMaskLevels: [{ match: NON_MATCHING_PATTERN, maskLevel: 'conservative' }],
      }),
    );
    const { getBodies } = await captureTrackRequests(page);

    await page.goto(buildUrl(PRIVACY_PAGE, { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
    await flushRecording(page);

    const root = getSnapshotRoot(getBodies());
    expect(root).not.toBeNull();

    // Under light (the unmatched fallback), a plain text input is NOT masked
    const textInput = findById(root!, 'text-input');
    expect(textInput).toBeDefined();
    const value = String(textInput!.attributes?.value ?? '');
    expect(value).toBe('visible input value');
    expect(isMaskedText(value)).toBe(false);

    // password inputs are still masked under light
    const passwordInput = findById(root!, 'password-input');
    expect(passwordInput).toBeDefined();
    expect(isMaskedText(String(passwordInput!.attributes?.value ?? ''))).toBe(true);
  });

  test('urlMaskLevels light rule wins over defaultMaskLevel conservative', async ({ page }) => {
    // defaultMaskLevel is conservative but the urlMaskLevels rule overrides it to
    // light for this specific page — the per-URL rule takes precedence.
    await mockRemoteConfig(
      page,
      remoteConfigWithPrivacy({
        defaultMaskLevel: 'conservative',
        urlMaskLevels: [{ match: MATCHING_PATTERN, maskLevel: 'light' }],
      }),
    );
    const { getBodies } = await captureTrackRequests(page);

    await page.goto(buildUrl(PRIVACY_PAGE, { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
    await flushRecording(page);

    const root = getSnapshotRoot(getBodies());
    expect(root).not.toBeNull();

    // The urlMaskLevels light override wins: plain text input is NOT masked
    const textInput = findById(root!, 'text-input');
    expect(textInput).toBeDefined();
    const value = String(textInput!.attributes?.value ?? '');
    expect(value).toBe('visible input value');
    expect(isMaskedText(value)).toBe(false);

    // password inputs are always masked regardless of mask level
    const passwordInput = findById(root!, 'password-input');
    expect(passwordInput).toBeDefined();
    expect(isMaskedText(String(passwordInput!.attributes?.value ?? ''))).toBe(true);
  });

  test('SPA navigation to unmatched URL falls back to conservative default and masks text', async ({ page }) => {
    // Regression test for the bugbot-identified privacy gap:
    // defaultMaskLevel:'conservative' + a non-conservative URL rule. Session starts on the test
    // page (MATCHING_PATTERN → light). After a SPA pushState to an unmatched URL, the effective
    // level falls back to 'conservative'. Because getMaskTextSelectors() now returns '*' in this
    // config (fix applied), rrweb routes all text through maskTextFn — which picks up the new URL
    // via the dynamic getter and masks text accordingly.
    await mockRemoteConfig(
      page,
      remoteConfigWithPrivacy({
        defaultMaskLevel: 'conservative',
        urlMaskLevels: [{ match: MATCHING_PATTERN, maskLevel: 'light' }],
      }),
    );
    const { getBodies } = await captureTrackRequests(page);

    await page.goto(buildUrl(PRIVACY_PAGE, { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    // Simulate SPA navigation to a URL that matches no urlMaskLevels rule.
    // The SDK's URL-change listener updates currentPageUrl; subsequent maskTextFn
    // calls then resolve to the conservative fallback.
    await page.evaluate(() => {
      history.pushState({}, '', '/session-replay-browser/unmatched-page');
      // Dispatch a focus event to make rrweb take a new full snapshot with the updated URL context.
      window.dispatchEvent(new Event('focus'));
    });
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
    await flushRecording(page);

    // The LAST full snapshot was taken after the URL change — plain text must be masked.
    const root = getLastSnapshotRoot(getBodies());
    expect(root).not.toBeNull();

    const el = findById(root!, 'plain-text');
    expect(el).toBeDefined();
    expect(isMaskedText(getTextContent(el!))).toBe(true);
  });
});
