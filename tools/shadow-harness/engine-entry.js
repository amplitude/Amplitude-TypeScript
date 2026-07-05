/**
 * esbuild entry for the multi-site shadow harness.
 *
 * Bundles the REAL shipping code — the element-selector engine plus the
 * autocapture capture-side helpers — and hangs it off `window.__AMP_SHADOW__`
 * so the harness can drive it against a live third-party DOM. Imported from
 * source (`src/`), so what runs in the browser is exactly the code on this
 * branch, not a stale prebuilt artifact.
 */
import {
  createSelectorEngine,
  resolveSelectorConfig,
  resolveSelector,
  composedParent,
  SHADOW_BOUNDARY_DELIMITER,
  collectOpenShadowRoots,
} from '../../packages/element-selector/src/index';

import {
  querySelectorAllDeep,
  getClosestElement,
} from '../../packages/plugin-autocapture-browser/src/helpers';
import { getAncestors } from '../../packages/plugin-autocapture-browser/src/hierarchy';

import {
  createClickObservable,
  createExposureObservable,
  createMutationObservable,
} from '../../packages/plugin-autocapture-browser/src/observables';

// eslint-disable-next-line no-undef
window.__AMP_SHADOW__ = {
  createSelectorEngine,
  resolveSelectorConfig,
  resolveSelector,
  composedParent,
  SHADOW_BOUNDARY_DELIMITER,
  collectOpenShadowRoots,
  querySelectorAllDeep,
  getClosestElement,
  getAncestors,
  createClickObservable,
  createExposureObservable,
  createMutationObservable,
};
