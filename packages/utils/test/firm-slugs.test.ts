import { describe, expect, it } from 'vitest';

import {
  isReservedFirmSlug,
  isValidFirmSlug,
  normalizeFirmSlug,
} from '../src/firm-slugs/index.js';

describe('firm-slugs', () => {
  describe('normalizeFirmSlug', () => {
    it('lowercases and normalizes separators', () => {
      expect(normalizeFirmSlug('  My_Firm  ')).toBe('my-firm');
    });
  });

  describe('isValidFirmSlug', () => {
    it('accepts hyphenated lowercase slugs', () => {
      expect(isValidFirmSlug('smith-co')).toBe(true);
      expect(isValidFirmSlug('veyra-ng')).toBe(true);
    });

    it('rejects uppercase and invalid shapes', () => {
      expect(isValidFirmSlug('veyraNG')).toBe(false);
      expect(isValidFirmSlug('ab')).toBe(false);
    });
  });

  describe('isReservedFirmSlug', () => {
    it('reserves veyra prefix namespace', () => {
      expect(isReservedFirmSlug('veyra')).toBe(true);
      expect(isReservedFirmSlug('veyra-ng')).toBe(true);
      expect(isReservedFirmSlug('veyrango')).toBe(true);
    });

    it('reserves accountable prefix namespace', () => {
      expect(isReservedFirmSlug('accountable')).toBe(true);
      expect(isReservedFirmSlug('accountable-hq')).toBe(true);
      expect(isReservedFirmSlug('accountablebooks')).toBe(true);
    });

    it('does not reserve unrelated slugs', () => {
      expect(isReservedFirmSlug('my-veyra')).toBe(false);
      expect(isReservedFirmSlug('smith-co')).toBe(false);
    });

    it('reserves exact platform slugs', () => {
      expect(isReservedFirmSlug('app')).toBe(true);
      expect(isReservedFirmSlug('api')).toBe(true);
    });
  });
});
