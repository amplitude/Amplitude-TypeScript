import {
  applyBodyMasking,
  captureSerializedBody,
  getBodyMaskingLists,
  isBodyCaptureEnabled,
} from '../src/network-body-capture';

describe('network-body-capture', () => {
  describe('isBodyCaptureEnabled', () => {
    it('returns false for undefined and false', () => {
      expect(isBodyCaptureEnabled(undefined)).toBe(false);
      expect(isBodyCaptureEnabled(false)).toBe(false);
    });

    it('returns true for boolean true and object configs', () => {
      expect(isBodyCaptureEnabled(true)).toBe(true);
      expect(isBodyCaptureEnabled({ allowlist: ['/user/id'] })).toBe(true);
    });

    it('returns false when enabled is false', () => {
      expect(isBodyCaptureEnabled({ allowlist: ['/user/id'], enabled: false })).toBe(false);
    });
  });

  describe('applyBodyMasking', () => {
    it('returns full body when no lists are configured', () => {
      const body = '{"email":"secret@example.com","id":1}';
      expect(applyBodyMasking(body, [], [])).toBe(body);
    });

    it('excludes nested fields when only excludelist is set', () => {
      const body = '{"variables":{"input":{"customer":{"email":"secret@example.com"}}},"id":1}';
      const result = applyBodyMasking(body, [], ['/variables/input/customer/email']);
      expect(JSON.parse(result)).toEqual({ id: 1 });
    });

    it('keeps only allowlisted fields', () => {
      const body = '{"email":"secret@example.com","id":1}';
      const result = applyBodyMasking(body, ['/id'], []);
      expect(JSON.parse(result)).toEqual({ id: 1 });
    });

    it('returns non-JSON bodies unchanged when masking is configured', () => {
      const body = 'not-json';
      expect(applyBodyMasking(body, [], ['/password'])).toBe(body);
    });
  });

  describe('captureSerializedBody', () => {
    it('masks then truncates serialized bodies', () => {
      const truncate = jest.fn((value: string) => ({ value: value.slice(0, 5), truncated: true }));
      const result = captureSerializedBody(
        '{"password":"secret","id":1}',
        { excludelist: ['/password'] },
        10,
        truncate,
      );

      expect(truncate).toHaveBeenCalledWith('{"id":1}', 10);
      expect(result).toEqual({ value: '{"id"', truncated: true });
    });
  });

  describe('getBodyMaskingLists', () => {
    it('returns empty lists for boolean configs', () => {
      expect(getBodyMaskingLists(true)).toEqual({ allowlist: [], excludelist: [] });
    });

    it('returns configured lists for object configs', () => {
      expect(getBodyMaskingLists({ allowlist: ['/id'], excludelist: ['/password'] })).toEqual({
        allowlist: ['/id'],
        excludelist: ['/password'],
      });
      expect(getBodyMaskingLists({ allowlist: ['/id'] })).toEqual({
        allowlist: ['/id'],
        excludelist: [],
      });
    });
  });
});
