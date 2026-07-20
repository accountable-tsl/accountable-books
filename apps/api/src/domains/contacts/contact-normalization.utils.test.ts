import { describe, expect, it } from 'vitest';

import { normalizeContactName } from './contact-normalization.utils.js';

describe('normalizeContactName', () => {
  it('normalizes case, whitespace, punctuation, and accents consistently', () => {
    expect(normalizeContactName('  AMZN MKTP UK*AB123  ')).toBe(
      'amzn mktp uk ab123',
    );
    expect(normalizeContactName('Café   Nero Ltd.')).toBe('cafe nero ltd');
  });
});
