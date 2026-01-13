import {
  isDeadClicksEnabled,
  isRageClicksEnabled,
  getDeadClicksCssSelectorAllowlist,
  getRageClicksCssSelectorAllowlist,
  DEFAULT_DEAD_CLICK_ALLOWLIST,
  DEFAULT_RAGE_CLICK_ALLOWLIST,
} from '../src';

describe('frustration-interactions helpers', () => {
  describe('isDeadClicksEnabled', () => {
    it('should return false when deadClicks is undefined or null', () => {
      expect(isDeadClicksEnabled(undefined)).toBe(false);
      expect(isDeadClicksEnabled(null)).toBe(false);
    });

    it('should return true when deadClicks is true', () => {
      expect(isDeadClicksEnabled(true)).toBe(true);
    });

    it('should return false when deadClicks is false', () => {
      expect(isDeadClicksEnabled(false)).toBe(false);
    });

    it('should return true when deadClicks is an object', () => {
      expect(isDeadClicksEnabled({})).toBe(true);
      expect(isDeadClicksEnabled({ cssSelectorAllowlist: ['button'] })).toBe(true);
    });
  });

  describe('isRageClicksEnabled', () => {
    it('should return false when rageClicks is undefined or null', () => {
      expect(isRageClicksEnabled(undefined)).toBe(false);
      expect(isRageClicksEnabled(null)).toBe(false);
    });

    it('should return true when rageClicks is true', () => {
      expect(isRageClicksEnabled(true)).toBe(true);
    });

    it('should return false when rageClicks is false', () => {
      expect(isRageClicksEnabled(false)).toBe(false);
    });

    it('should return true when rageClicks is an object', () => {
      expect(isRageClicksEnabled({})).toBe(true);
      expect(isRageClicksEnabled({ cssSelectorAllowlist: ['button'] })).toBe(true);
    });
  });

  describe('getDeadClicksCssSelectorAllowlist', () => {
    it('should return default allowlist when deadClicks is undefined', () => {
      expect(getDeadClicksCssSelectorAllowlist(undefined)).toEqual(DEFAULT_DEAD_CLICK_ALLOWLIST);
    });

    it('should return default allowlist when deadClicks is true', () => {
      expect(getDeadClicksCssSelectorAllowlist(true)).toEqual(DEFAULT_DEAD_CLICK_ALLOWLIST);
    });

    it('should return default allowlist when deadClicks is false', () => {
      expect(getDeadClicksCssSelectorAllowlist(false)).toEqual(DEFAULT_DEAD_CLICK_ALLOWLIST);
    });

    it('should return default allowlist when deadClicks is an empty object', () => {
      expect(getDeadClicksCssSelectorAllowlist({})).toEqual(DEFAULT_DEAD_CLICK_ALLOWLIST);
    });

    it('should return custom allowlist when provided', () => {
      const customAllowlist = ['button', 'a'];
      expect(getDeadClicksCssSelectorAllowlist({ cssSelectorAllowlist: customAllowlist })).toEqual(customAllowlist);
    });
  });

  describe('getRageClicksCssSelectorAllowlist', () => {
    it('should return default allowlist when rageClicks is undefined', () => {
      expect(getRageClicksCssSelectorAllowlist(undefined)).toEqual(DEFAULT_RAGE_CLICK_ALLOWLIST);
    });

    it('should return default allowlist when rageClicks is true', () => {
      expect(getRageClicksCssSelectorAllowlist(true)).toEqual(DEFAULT_RAGE_CLICK_ALLOWLIST);
    });

    it('should return default allowlist when rageClicks is false', () => {
      expect(getRageClicksCssSelectorAllowlist(false)).toEqual(DEFAULT_RAGE_CLICK_ALLOWLIST);
    });

    it('should return default allowlist when rageClicks is an empty object', () => {
      expect(getRageClicksCssSelectorAllowlist({})).toEqual(DEFAULT_RAGE_CLICK_ALLOWLIST);
    });

    it('should return custom allowlist when provided', () => {
      const customAllowlist = ['input', 'select'];
      expect(getRageClicksCssSelectorAllowlist({ cssSelectorAllowlist: customAllowlist })).toEqual(customAllowlist);
    });
  });
});
