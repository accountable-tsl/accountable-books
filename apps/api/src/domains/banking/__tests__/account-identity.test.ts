import { beforeEach, describe, expect, it } from 'vitest';

import {
  deriveAccountNumberIdentity,
  fingerprintAccountNumber,
  maskAccountNumber,
  normalizeAccountNumber,
} from '../account-identity.js';

describe('account-identity', () => {
  beforeEach(() => {
    process.env.ACCOUNT_NUMBER_HMAC_KEY =
      'dev-account-number-hmac-key-do-not-use-in-prod';
    process.env.ACCOUNT_NUMBER_FINGERPRINT_VERSION = '1';
  });

  it('normalizes by stripping presentation separators and preserving leading zeros', () => {
    expect(normalizeAccountNumber(' 0012-3456.7890 ')).toBe('001234567890');
    expect(normalizeAccountNumber('12_34.56')).toBe('123456');
  });

  it('masks to the last four characters of the normalized form', () => {
    expect(maskAccountNumber('001234567890')).toBe('7890');
    expect(maskAccountNumber('12')).toBe('12');
  });

  it('produces a stable HMAC fingerprint for fixed test vectors', () => {
    const normalized = '001234567890';
    const fp = fingerprintAccountNumber(normalized, 1);
    expect(fp).toBe(
      '33c0b3231eae77c4b773a3bca7c1322a0747cfd960f04244aa7e5c3b2efa25d4',
    );
    expect(
      fingerprintAccountNumber('0012-3456.7890'.replace(/[\s\-._]/g, ''), 1),
    ).toBe(fp);
  });

  it('derives identity and does not retain plaintext', () => {
    const identity = deriveAccountNumberIdentity('0012-3456-7890');
    expect(identity.account_number_mask).toBe('7890');
    expect(identity.account_number_fingerprint_version).toBe(1);
    expect(identity.account_number_fingerprint).toHaveLength(64);
    expect(JSON.stringify(identity)).not.toContain('001234567890');
  });

  it('matches the same fingerprint for separator variants', () => {
    const a = deriveAccountNumberIdentity('1234-5678');
    const b = deriveAccountNumberIdentity('1234 5678');
    const c = deriveAccountNumberIdentity('12345678');
    expect(a.account_number_fingerprint).toBe(b.account_number_fingerprint);
    expect(b.account_number_fingerprint).toBe(c.account_number_fingerprint);
  });

  describe('fixed test vectors', () => {
    it('NFKC-normalizes fullwidth digits to their ASCII equivalents', () => {
      // U+FF11..U+FF18 (fullwidth 1-8) are NFKC-compatible with ASCII 1-8.
      expect(normalizeAccountNumber('１２３４５６７８')).toBe('12345678');
    });

    it('produces the same fingerprint for fullwidth and ASCII digit forms', () => {
      const fullwidth = deriveAccountNumberIdentity('００１２３４５６７８９０');
      const ascii = deriveAccountNumberIdentity(
        '0012345678 90'.replace(/\s/g, ''),
      );
      expect(fullwidth.account_number_fingerprint).toBe(
        ascii.account_number_fingerprint,
      );
      expect(fullwidth.account_number_mask).toBe(ascii.account_number_mask);
    });

    it('preserves leading zeros as significant (not numeric normalization)', () => {
      const withLeadingZero = deriveAccountNumberIdentity('0123456');
      const withoutLeadingZero = deriveAccountNumberIdentity('123456');
      expect(withLeadingZero.account_number_fingerprint).not.toBe(
        withoutLeadingZero.account_number_fingerprint,
      );
      expect(normalizeAccountNumber('0012-3456')).toBe('00123456');
    });

    it('strips only presentation separators (space, dash, dot, underscore)', () => {
      expect(normalizeAccountNumber('12 34-56.78_90')).toBe('1234567890');
      // Non-presentation characters (e.g. a slash) are not stripped, so a
      // value containing one must not collide with the stripped form.
      expect(normalizeAccountNumber('12/34')).toBe('12/34');
      expect(normalizeAccountNumber('12/34')).not.toBe(
        normalizeAccountNumber('1234'),
      );
    });
  });
});
