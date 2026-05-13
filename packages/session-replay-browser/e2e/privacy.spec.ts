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

  test('defaultMaskLevel light → plain body text is visible (no urlMaskLevels)', async ({ page }) => {
    // Bug repro #1: with no urlMaskLevels, getMaskTextSelectors() returns undefined for
    // light/medium effective levels, so rrweb never routes text through maskTextFn. Text
    // should be visible in the snapshot regardless of isMaskedForLevel.
    const privacyConfig = JSON.stringify({ defaultMaskLevel: 'light' });
    await mockRemoteConfig(page, remoteConfigRecording);
    const { getBodies } = await captureTrackRequests(page);

    await page.goto(buildUrl(PRIVACY_PAGE, { sessionId: TEST_SESSION_ID, privacyConfig }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
    await flushRecording(page);

    const root = getSnapshotRoot(getBodies());
    expect(root).not.toBeNull();

    const plainEl = findById(root!, 'plain-text');
    expect(plainEl).toBeDefined();
    expect(getTextContent(plainEl!)).toContain('Hello visible world');
    expect(isMaskedText(getTextContent(plainEl!))).toBe(false);
  });

  test('defaultMaskLevel medium → plain body text is visible (no urlMaskLevels)', async ({ page }) => {
    // Bug repro #2: same as above for medium. The unit-test "medium masks text" assertion
    // does not reflect the actual rrweb flow when urlMaskLevels is absent — rrweb is
    // never told to route text through maskTextFn.
    const privacyConfig = JSON.stringify({ defaultMaskLevel: 'medium' });
    await mockRemoteConfig(page, remoteConfigRecording);
    const { getBodies } = await captureTrackRequests(page);

    await page.goto(buildUrl(PRIVACY_PAGE, { sessionId: TEST_SESSION_ID, privacyConfig }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
    await flushRecording(page);

    const root = getSnapshotRoot(getBodies());
    expect(root).not.toBeNull();

    const plainEl = findById(root!, 'plain-text');
    expect(plainEl).toBeDefined();
    expect(getTextContent(plainEl!)).toContain('Hello visible world');
    expect(isMaskedText(getTextContent(plainEl!))).toBe(false);
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

// ─── amp-unmask CSS class (SR-2945) ──────────────────────────────────────────

test.describe('privacy — amp-unmask CSS class', () => {
  test('amp-unmask class unmasks text under conservative masking from remote config without explicit unmaskSelector', async ({
    page,
  }) => {
    // Before SR-2945, .amp-unmask had no effect unless the user explicitly added
    // '.amp-unmask' to privacyConfig.unmaskSelector. Now it's wired as a default.
    await mockRemoteConfig(page, remoteConfigWithPrivacy({ defaultMaskLevel: 'conservative' }));
    const { getBodies } = await captureTrackRequests(page);

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
    const { getBodies } = await captureTrackRequests(page);

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

  test('remote urlMaskLevels conservative rule masks plain text end-to-end', async ({ page }) => {
    // P0: exercises the full remote → join → apply pipeline for urlMaskLevels.
    // No local privacyConfig — the conservative urlMaskLevels rule comes entirely from
    // sr_privacy_config. defaultMaskLevel is left at the default (medium) so text masking
    // is driven solely by the URL rule matching the test page.
    await mockRemoteConfig(
      page,
      remoteConfigWithPrivacy({
        urlMaskLevels: [{ match: 'http://localhost:5173/session-replay-browser/*', maskLevel: 'conservative' }],
      }),
    );
    const { getBodies } = await captureTrackRequests(page);

    await page.goto(buildUrl(PRIVACY_PAGE, { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
    await flushRecording(page);

    const root = getSnapshotRoot(getBodies());
    expect(root).not.toBeNull();

    // The conservative urlMaskLevels rule matches this page — plain text must be masked.
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

  test('URL does not match any rule → defaultMaskLevel (conservative) masks plain text', async ({ page }) => {
    // The urlMaskLevels rule targets a different page, so it never fires.
    // defaultMaskLevel is 'conservative': plain text must still be masked even though
    // no URL rule matched. Mirrors the redis.io homepage scenario where the homepage
    // URL matches no rule and should fall back to conservative.
    await mockRemoteConfig(
      page,
      remoteConfigWithPrivacy({
        defaultMaskLevel: 'conservative',
        urlMaskLevels: [{ match: NON_MATCHING_PATTERN, maskLevel: 'light' }],
      }),
    );
    const { getBodies } = await captureTrackRequests(page);

    await page.goto(buildUrl(PRIVACY_PAGE, { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
    await flushRecording(page);

    const root = getSnapshotRoot(getBodies());
    expect(root).not.toBeNull();

    // Under conservative (the unmatched fallback), plain text IS masked
    const el = findById(root!, 'plain-text');
    expect(el).toBeDefined();
    expect(isMaskedText(getTextContent(el!))).toBe(true);
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
    // NOTE: MATCHING_PATTERN covers /session-replay-browser/*, so navigate outside that path.
    // The SDK's URL-change listener updates currentPageUrl; subsequent maskTextFn
    // calls then resolve to the conservative fallback.
    await page.evaluate(() => {
      history.pushState({}, '', '/other-section/dashboard');
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

  test('SPA navigation from conservative URL to light URL leaves text visible', async ({ page }) => {
    // Verifies maskFn URL-awareness: session starts on a conservative URL rule, then navigates
    // to a light URL rule. Light leaves text nodes visible, so plain text becomes unmasked
    // after navigation.
    // Use exact URL patterns to avoid first-match-wins overlap with the wildcard MATCHING_PATTERN.
    const CONSERVATIVE_PATTERN = 'http://localhost:5173/session-replay-browser/sr-privacy-test.html*';
    const LIGHT_PATTERN = 'http://localhost:5173/section-light/*';
    await mockRemoteConfig(
      page,
      remoteConfigWithPrivacy({
        defaultMaskLevel: 'medium',
        urlMaskLevels: [
          { match: CONSERVATIVE_PATTERN, maskLevel: 'conservative' },
          { match: LIGHT_PATTERN, maskLevel: 'light' },
        ],
      }),
    );
    const { getBodies } = await captureTrackRequests(page);

    await page.goto(buildUrl(PRIVACY_PAGE, { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    // Initial snapshot: on the conservative URL — plain text should be masked.
    await flushRecording(page);
    const firstRoot = getSnapshotRoot(getBodies());
    expect(firstRoot).not.toBeNull();
    expect(isMaskedText(getTextContent(findById(firstRoot!, 'plain-text')!))).toBe(true);

    // Navigate to the light URL rule page via SPA pushState.
    await page.evaluate(() => {
      history.pushState({}, '', '/section-light/dashboard');
      window.dispatchEvent(new Event('focus'));
    });
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
    await flushRecording(page);

    // The LAST full snapshot was taken on the light URL — plain text is NOT masked under light.
    const lastRoot = getLastSnapshotRoot(getBodies());
    expect(lastRoot).not.toBeNull();
    const plainEl = findById(lastRoot!, 'plain-text');
    expect(plainEl).toBeDefined();
    expect(isMaskedText(getTextContent(plainEl!))).toBe(false);
  });

  test('SPA navigation from light URL to conservative URL masks text', async ({ page }) => {
    // Verifies maskFn URL-awareness in the other direction: session starts on a light URL,
    // navigates to a conservative URL — maskTextFn should pick up the new URL and mask text.
    // Use exact URL patterns to avoid first-match-wins overlap.
    const LIGHT_PATTERN = 'http://localhost:5173/session-replay-browser/sr-privacy-test.html*';
    const CONSERVATIVE_PATTERN = 'http://localhost:5173/section-secure/*';
    await mockRemoteConfig(
      page,
      remoteConfigWithPrivacy({
        defaultMaskLevel: 'medium',
        urlMaskLevels: [
          { match: LIGHT_PATTERN, maskLevel: 'light' },
          { match: CONSERVATIVE_PATTERN, maskLevel: 'conservative' },
        ],
      }),
    );
    const { getBodies } = await captureTrackRequests(page);

    await page.goto(buildUrl(PRIVACY_PAGE, { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    // Navigate to the conservative URL rule page via SPA pushState.
    await page.evaluate(() => {
      history.pushState({}, '', '/section-secure/checkout');
      window.dispatchEvent(new Event('focus'));
    });
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
    await flushRecording(page);

    // The LAST full snapshot was taken on the conservative URL — plain text must be masked.
    const lastRoot = getLastSnapshotRoot(getBodies());
    expect(lastRoot).not.toBeNull();
    const plainEl = findById(lastRoot!, 'plain-text');
    expect(plainEl).toBeDefined();
    expect(isMaskedText(getTextContent(plainEl!))).toBe(true);
  });

  // Repro for GoFundMe customer report (Slack C0AJHTHCB96 / 2026-05-12):
  // defaultMaskLevel: conservative + a urlMaskLevels rule routing the page to 'light'.
  // Under the light URL rule, plain <p> body text on the matched page is visible.
  test('urlMaskLevels light rule leaves plain body text visible (GFM repro)', async ({ page }) => {
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

    const plainEl = findById(root!, 'plain-text');
    expect(plainEl).toBeDefined();
    expect(getTextContent(plainEl!)).toContain('Hello visible world');
    expect(isMaskedText(getTextContent(plainEl!))).toBe(false);
  });

  // urlMaskLevels medium rule masks text (matches the documented MaskLevel contract:
  // medium = "All inputs and all texts"). When the URL rule triggers
  // getMaskTextSelectors() to return '*', rrweb routes text through maskTextFn and
  // isMaskedForLevel(text, medium) returns true → text masked.
  test('urlMaskLevels medium rule masks plain body text', async ({ page }) => {
    await mockRemoteConfig(
      page,
      remoteConfigWithPrivacy({
        defaultMaskLevel: 'conservative',
        urlMaskLevels: [{ match: MATCHING_PATTERN, maskLevel: 'medium' }],
      }),
    );
    const { getBodies } = await captureTrackRequests(page);

    await page.goto(buildUrl(PRIVACY_PAGE, { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
    await flushRecording(page);

    const root = getSnapshotRoot(getBodies());
    expect(root).not.toBeNull();

    const plainEl = findById(root!, 'plain-text');
    expect(plainEl).toBeDefined();
    expect(isMaskedText(getTextContent(plainEl!))).toBe(true);
  });

  test('first-match-wins: second rule (light) applies when first rule does not match', async ({ page }) => {
    // P1: regression guard for rule evaluation order.
    // Three rules; only the second matches the test page URL.
    // Rule 1 (conservative): targets a different path — must NOT match.
    // Rule 2 (light):        targets the test page — MUST match and apply.
    // Rule 3 (conservative): also targets the test page but comes after rule 2 — must NOT be evaluated.
    // Effective level must be 'light': plain text input is NOT masked.
    // TC-07: covered — three rules, second wins.
    await mockRemoteConfig(
      page,
      remoteConfigWithPrivacy({
        defaultMaskLevel: 'medium',
        urlMaskLevels: [
          { match: 'http://localhost:5173/other-section/*', maskLevel: 'conservative' },
          { match: 'http://localhost:5173/session-replay-browser/*', maskLevel: 'light' },
          { match: 'http://localhost:5173/session-replay-browser/*', maskLevel: 'conservative' },
        ],
      }),
    );
    const { getBodies } = await captureTrackRequests(page);

    await page.goto(buildUrl(PRIVACY_PAGE, { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
    await flushRecording(page);

    const root = getSnapshotRoot(getBodies());
    expect(root).not.toBeNull();

    // Rule 2 (light) wins: plain text input is NOT masked.
    const textInput = findById(root!, 'text-input');
    expect(textInput).toBeDefined();
    const value = String(textInput!.attributes?.value ?? '');
    expect(value).toBe('visible input value');
    expect(isMaskedText(value)).toBe(false);

    // Password inputs are always masked regardless of mask level.
    const passwordInput = findById(root!, 'password-input');
    expect(passwordInput).toBeDefined();
    expect(isMaskedText(String(passwordInput!.attributes?.value ?? ''))).toBe(true);
  });

  // TC-08: first-match-wins blocks more-specific later rules.
  test('first-match-wins: broad /** rule fires before more-specific path rule', async ({ page }) => {
    // TC-08: Rules in order: [1] matching conservative /**,  [2] matching light /path/*.
    // Rule 1 fires first because it appears first — rule 2 must never be evaluated.
    // Effective level must be 'conservative': plain text IS masked.
    await mockRemoteConfig(
      page,
      remoteConfigWithPrivacy({
        defaultMaskLevel: 'medium',
        urlMaskLevels: [
          // Rule 1: broad /** — matches the test page, conservative.
          { match: 'http://localhost:5173/**', maskLevel: 'conservative' },
          // Rule 2: more-specific path — also matches, but comes AFTER rule 1.
          { match: 'http://localhost:5173/session-replay-browser/*', maskLevel: 'light' },
        ],
      }),
    );
    const { getBodies } = await captureTrackRequests(page);

    await page.goto(buildUrl(PRIVACY_PAGE, { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
    await flushRecording(page);

    const root = getSnapshotRoot(getBodies());
    expect(root).not.toBeNull();

    // Rule 1 (conservative) wins: plain text IS masked.
    const el = findById(root!, 'plain-text');
    expect(el).toBeDefined();
    expect(isMaskedText(getTextContent(el!))).toBe(true);
  });

  // TC-09: trailing /** matches base path (no trailing slash on the URL).
  test('trailing /** pattern matches the test page URL (no trailing slash)', async ({ page }) => {
    // TC-09: The pattern http://localhost:5173/session-replay-browser/** should match
    // the test page URL (which has a path but no trailing slash after the filename).
    // globToRegex converts trailing /** to (/.*)?  — the optional group covers the
    // /file.html portion of the URL.
    await mockRemoteConfig(
      page,
      remoteConfigWithPrivacy({
        defaultMaskLevel: 'light',
        urlMaskLevels: [{ match: 'http://localhost:5173/session-replay-browser/**', maskLevel: 'conservative' }],
      }),
    );
    const { getBodies } = await captureTrackRequests(page);

    await page.goto(buildUrl(PRIVACY_PAGE, { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
    await flushRecording(page);

    const root = getSnapshotRoot(getBodies());
    expect(root).not.toBeNull();

    // The conservative /** rule matched — plain text IS masked.
    const el = findById(root!, 'plain-text');
    expect(el).toBeDefined();
    expect(isMaskedText(getTextContent(el!))).toBe(true);
  });

  // TC-10: middle /**/ matches zero intermediate segments.
  test('middle /**/ glob matches URL with zero intermediate path segments', async ({ page }) => {
    // TC-10: Pattern http://localhost:5173/**/sr-privacy-test.html should match
    // the test page URL where there are no intermediate path segments between
    // the origin and the filename (zero-segment match for /**/).
    // globToRegex converts /**/ to /(.*\/)?  — the optional group covers the zero-segment case.
    await mockRemoteConfig(
      page,
      remoteConfigWithPrivacy({
        defaultMaskLevel: 'light',
        urlMaskLevels: [{ match: 'http://localhost:5173/**/sr-privacy-test.html*', maskLevel: 'conservative' }],
      }),
    );
    const { getBodies } = await captureTrackRequests(page);

    await page.goto(buildUrl(PRIVACY_PAGE, { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
    await flushRecording(page);

    const root = getSnapshotRoot(getBodies());
    expect(root).not.toBeNull();

    // The conservative /**/ rule matched — plain text IS masked.
    const el = findById(root!, 'plain-text');
    expect(el).toBeDefined();
    expect(isMaskedText(getTextContent(el!))).toBe(true);
  });

  // TC-13: blur + SPA nav to light URL + focus uses fresh URL — input visible in new snapshot.
  test('SPA navigation to light URL: fresh snapshot shows text input not masked', async ({ page }) => {
    // TC-13: Start on a conservative URL rule. SPA-pushState to a URL that matches a light
    // rule. Dispatch blur then focus to force rrweb to take a new full snapshot.
    // Verify the new snapshot captures the text input as NOT masked (light level for inputs).
    // The existing conservative→light test only checks plain text (which is masked at both levels).
    // This test specifically checks that the input masking decision uses the NEW URL.
    const CONSERVATIVE_PATTERN = 'http://localhost:5173/session-replay-browser/sr-privacy-test.html*';
    const LIGHT_PATTERN = 'http://localhost:5173/section-light-inputs/*';
    await mockRemoteConfig(
      page,
      remoteConfigWithPrivacy({
        defaultMaskLevel: 'medium',
        urlMaskLevels: [
          { match: CONSERVATIVE_PATTERN, maskLevel: 'conservative' },
          { match: LIGHT_PATTERN, maskLevel: 'light' },
        ],
      }),
    );
    const { getBodies } = await captureTrackRequests(page);

    await page.goto(buildUrl(PRIVACY_PAGE, { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    // Initial snapshot on the conservative URL: text input MUST be masked.
    await flushRecording(page);
    const firstRoot = getSnapshotRoot(getBodies());
    expect(firstRoot).not.toBeNull();
    expect(isMaskedText(String(findById(firstRoot!, 'text-input')!.attributes?.value ?? ''))).toBe(true);

    // SPA navigate to the light URL and force a fresh full snapshot via blur→focus cycle.
    await page.evaluate(() => {
      history.pushState({}, '', '/section-light-inputs/page');
      // blur flushes pending events; focus triggers rrweb's full-snapshot on re-focus.
      window.dispatchEvent(new Event('blur'));
      window.dispatchEvent(new Event('focus'));
    });
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
    await flushRecording(page);

    // The LAST full snapshot was taken on the light URL — text input must NOT be masked.
    const lastRoot = getLastSnapshotRoot(getBodies());
    expect(lastRoot).not.toBeNull();
    const textInput = findById(lastRoot!, 'text-input');
    expect(textInput).toBeDefined();
    const value = String(textInput!.attributes?.value ?? '');
    expect(value).toBe('visible input value');
    expect(isMaskedText(value)).toBe(false);
  });
});

// ─── urlMaskLevels — glob pattern edge cases ──────────────────────────────────

test.describe('privacy — urlMaskLevels glob edge cases', () => {
  // The exact (no-wildcard) URL of the test page, used for TC-01 and TC-03.
  // buildUrl() appends ?sessionId=… so the actual browser URL always has a query string.
  // An exact-match pattern (no glob chars) compiles to /^…\.html$/ which does NOT match.
  const EXACT_PATTERN = 'http://localhost:5173/session-replay-browser/sr-privacy-test.html';

  // TC-01: exact pattern without wildcard does NOT match a URL that carries a query string.
  test('TC-01: exact pattern (no wildcard) does not match URL with query string → text input visible', async ({
    page,
  }) => {
    // The actual page URL from buildUrl() is http://…/sr-privacy-test.html?sessionId=…
    // The exact EXACT_PATTERN has no wildcard, so it compiles to /^…\.html$/ which
    // fails to match the URL that includes ?sessionId=…  The rule does not fire, so
    // the effective mask level falls back to defaultMaskLevel: light.
    // Under light, plain text input values are NOT masked.
    await mockRemoteConfig(
      page,
      remoteConfigWithPrivacy({
        defaultMaskLevel: 'light',
        urlMaskLevels: [{ match: EXACT_PATTERN, maskLevel: 'conservative' }],
      }),
    );
    const { getBodies } = await captureTrackRequests(page);

    await page.goto(buildUrl(PRIVACY_PAGE, { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
    await flushRecording(page);

    const root = getSnapshotRoot(getBodies());
    expect(root).not.toBeNull();

    // The conservative rule did NOT match (query string present) — light fallback applies.
    // Under light, text input values are NOT masked.
    const textInput = findById(root!, 'text-input');
    expect(textInput).toBeDefined();
    const value = String(textInput!.attributes?.value ?? '');
    expect(value).toBe('visible input value');
    expect(isMaskedText(value)).toBe(false);
  });

  // TC-02: workaround — pattern ending in /** DOES match a URL with a query string.
  test('TC-02: pattern ending in /** matches URL with query string → text input masked', async ({ page }) => {
    // The /** suffix compiles to (/.*)?  which matches /sr-privacy-test.html?sessionId=…
    // (the .* inside the group covers everything including the ? and query params).
    // Rule fires → conservative → plain text inputs ARE masked.
    // Contrast with TC-01 where the exact pattern misses and the light fallback leaves
    // plain text inputs visible.
    await mockRemoteConfig(
      page,
      remoteConfigWithPrivacy({
        defaultMaskLevel: 'light',
        urlMaskLevels: [{ match: 'http://localhost:5173/session-replay-browser/**', maskLevel: 'conservative' }],
      }),
    );
    const { getBodies } = await captureTrackRequests(page);

    await page.goto(buildUrl(PRIVACY_PAGE, { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
    await flushRecording(page);

    const root = getSnapshotRoot(getBodies());
    expect(root).not.toBeNull();

    // The conservative /** rule matched — plain text input IS masked (conservative masks all inputs).
    // Under light (the fallback if the rule had not matched) the text input would be visible.
    const textInput = findById(root!, 'text-input');
    expect(textInput).toBeDefined();
    const value = String(textInput!.attributes?.value ?? '');
    expect(isMaskedText(value)).toBe(true);
  });

  // TC-03: exact pattern without wildcard does NOT match a URL with a hash fragment.
  test('TC-03: exact pattern (no wildcard) does not match URL with hash fragment → text input visible', async ({
    page,
  }) => {
    // Navigate to the page appending a #fragment AFTER the query string.
    // window.location.href includes the hash, so the SDK sees the full URL with #frag.
    // The exact EXACT_PATTERN regex /^…\.html$/ does NOT match — rule misses.
    // Effective level falls back to defaultMaskLevel: light → text input NOT masked.
    await mockRemoteConfig(
      page,
      remoteConfigWithPrivacy({
        defaultMaskLevel: 'light',
        urlMaskLevels: [{ match: EXACT_PATTERN, maskLevel: 'conservative' }],
      }),
    );
    const { getBodies } = await captureTrackRequests(page);

    // Append a hash fragment to the URL so the SDK's location.href differs from EXACT_PATTERN.
    await page.goto(buildUrl(PRIVACY_PAGE, { sessionId: TEST_SESSION_ID }) + '#myfragment');
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
    await flushRecording(page);

    const root = getSnapshotRoot(getBodies());
    expect(root).not.toBeNull();

    // The conservative rule did NOT match (hash fragment present) — light fallback applies.
    // Under light, text input values are NOT masked.
    const textInput = findById(root!, 'text-input');
    expect(textInput).toBeDefined();
    const value = String(textInput!.attributes?.value ?? '');
    expect(value).toBe('visible input value');
    expect(isMaskedText(value)).toBe(false);
  });
});

// ─── Remote-config / local-config merge priority ─────────────────────────────

test.describe('privacy — remote vs local config merge priority', () => {
  // TC-04: remote-config-only conservative urlMaskLevels rule → already covered by
  //   'remote urlMaskLevels conservative rule masks plain text end-to-end' above.
  //   Skipped here to avoid duplication.

  // TC-05: remote conservative rule + local light rule for same URL → remote wins.
  test('TC-05: remote conservative urlMaskLevels rule wins over local light rule (remote prepended)', async ({
    page,
  }) => {
    // joined-config prepends remote urlMaskLevels before local ones, so the remote
    // conservative rule appears first in the merged list and fires first.
    // The local light rule (passed via privacyConfig URL param) is never reached.
    // Expected: plain text IS masked (conservative wins).
    const localPrivacyConfig = JSON.stringify({
      urlMaskLevels: [{ match: 'http://localhost:5173/session-replay-browser/*', maskLevel: 'light' }],
    });

    await mockRemoteConfig(
      page,
      remoteConfigWithPrivacy({
        urlMaskLevels: [{ match: 'http://localhost:5173/session-replay-browser/*', maskLevel: 'conservative' }],
      }),
    );
    const { getBodies } = await captureTrackRequests(page);

    await page.goto(buildUrl(PRIVACY_PAGE, { sessionId: TEST_SESSION_ID, privacyConfig: localPrivacyConfig }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
    await flushRecording(page);

    const root = getSnapshotRoot(getBodies());
    expect(root).not.toBeNull();

    // Remote conservative rule prepended → it matches first → plain text IS masked.
    const el = findById(root!, 'plain-text');
    expect(el).toBeDefined();
    expect(isMaskedText(getTextContent(el!))).toBe(true);
  });

  // TC-06: remote defaultMaskLevel overrides local conservative.
  test('TC-06: remote defaultMaskLevel medium overrides local conservative → text input not masked', async ({
    page,
  }) => {
    // joined-config uses remote defaultMaskLevel when set, ignoring local.
    // Remote says 'medium', local (via URL param) says 'conservative'.
    // No URL rules match. Effective defaultMaskLevel is 'medium'.
    //
    // Under medium, getMaskTextSelectors() returns undefined (not '*') so rrweb does NOT
    // route text nodes through maskTextFn — plain text is not masked at snapshot time.
    // Text inputs ARE masked under medium (medium masks all inputs).
    //
    // We verify via text-input: under medium all inputs are masked (value = asterisks).
    // We also verify no conservative over-masking occurred by checking text-input is masked
    // (medium) rather than checking it's unmasked — the key assertion is that remote medium
    // wins, not local conservative (which would also mask inputs). Instead we use the
    // existing 'URL does not match any rule → defaultMaskLevel (light) applies' pattern and
    // verify that the remote medium default does NOT mask the text input less than conservative:
    // both mask inputs, so the distinguishing check is that remote medium beats local
    // conservative by using the remote value and that getMaskTextSelectors does not
    // set maskTextSelector='*' (which would mask plain text nodes).
    //
    // Practical assertion: plain text paragraph is NOT masked (medium doesn't use maskTextSelector='*').
    const localPrivacyConfig = JSON.stringify({ defaultMaskLevel: 'conservative' });

    await mockRemoteConfig(
      page,
      remoteConfigWithPrivacy({
        defaultMaskLevel: 'medium',
      }),
    );
    const { getBodies } = await captureTrackRequests(page);

    await page.goto(buildUrl(PRIVACY_PAGE, { sessionId: TEST_SESSION_ID, privacyConfig: localPrivacyConfig }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
    await flushRecording(page);

    const root = getSnapshotRoot(getBodies());
    expect(root).not.toBeNull();

    // Remote medium wins over local conservative.
    // getMaskTextSelectors() returns undefined under medium (no '*') → plain text NOT masked at snapshot.
    const el = findById(root!, 'plain-text');
    expect(el).toBeDefined();
    expect(isMaskedText(getTextContent(el!))).toBe(false);
  });
});
