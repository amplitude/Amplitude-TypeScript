export interface ZoningFlags {
  /** FeatureFlagId.ZoningCssMatchAggregation */
  cssMatchAggregation: boolean;
  /** Resolved: subFfRollout && shadowDom (opt-in only). */
  shadowDom: boolean;
}

export const resolveZoningFlags = (raw: {
  subFfRollout: boolean;
  shadowDom: boolean;
  cssMatchAggregation: boolean;
}): ZoningFlags => ({
  cssMatchAggregation: raw.cssMatchAggregation,
  shadowDom: raw.subFfRollout && raw.shadowDom,
});
