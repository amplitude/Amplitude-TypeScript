import React from 'react';
import type { ReactElement, ReactNode } from 'react';
import { AmpMaskView } from './amp-mask-view';
import { ampMaskViewMaskProp } from './Mask.types';
import type { AmpMaskLevel } from './Mask.types';

let warned = false;

/** Logs at most one degraded-masking error per app session, across all fallback paths. */
export function warnOnce(message: string) {
  if (!warned) {
    warned = true;
    console.error(message);
  }
}

interface FallbackOptions {
  /** `mask` value forced onto `<AmpMaskView>`; 'from-maskLevel' derives it from the caller's `maskLevel` prop. */
  mask: 'amp-unmask' | 'from-maskLevel';
  /** Passed to {@link warnOnce} on every render. */
  warning: string;
  /** When set, dev builds throw this instead of rendering the fallback. */
  devThrowMessage?: string;
}

/**
 * Builds an `<AmpMask>`/`<AmpUnmask>` stand-in that renders through the Paper
 * `<AmpMaskView>`: privacy-safe (content stays masked) but not
 * layout-transparent. Used when the Fabric `SRMaskView` isn't available —
 * Old-Architecture apps and New-Architecture build misconfigurations.
 *
 * Fail-closed rules, enforced at runtime because untyped callers can spread
 * arbitrary props even though the public types omit them:
 * `style`/`enabled`/`mask` are stripped, and the forced `mask` value is
 * applied after the caller's props so it can never be overridden.
 */
export function createAmpMaskViewFallback<P extends { children?: ReactNode }>(
  options: FallbackOptions,
): (props: P) => ReactElement {
  return function AmpMaskViewFallback(props: P) {
    if (options.devThrowMessage !== undefined && __DEV__) {
      throw new Error(options.devThrowMessage);
    }
    warnOnce(options.warning);
    const {
      children,
      maskLevel,
      style: _style,
      enabled: _enabled,
      mask: _mask,
      ...safeProps
    } = props as P & { maskLevel?: AmpMaskLevel; style?: unknown; enabled?: boolean; mask?: unknown };
    const mask = options.mask === 'amp-unmask' ? 'amp-unmask' : ampMaskViewMaskProp(maskLevel);
    return (
      <AmpMaskView {...safeProps} mask={mask}>
        {children}
      </AmpMaskView>
    );
  };
}
