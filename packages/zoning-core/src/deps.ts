import type { ResolvedSelectorConfig, SelectorEngine } from '@amplitude/element-selector';

export interface ZoningCoreDeps {
  engine: SelectorEngine | null;
  config: ResolvedSelectorConfig;
  onError?: (error: unknown, ctx: { component: string; extra?: Record<string, unknown> }) => void;
}

export const notifyError = (
  deps: ZoningCoreDeps,
  error: unknown,
  ctx: { component: string; extra?: Record<string, unknown> },
): void => {
  deps.onError?.(error, ctx);
};
