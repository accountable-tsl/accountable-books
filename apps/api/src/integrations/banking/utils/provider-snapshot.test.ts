import { describe, expect, it } from 'vitest';

import { sanitizeProviderSnapshot } from './provider-snapshot.js';

describe('sanitizeProviderSnapshot', () => {
  it('drops unknown provider fields instead of relying on sensitive-name detection', () => {
    expect(
      sanitizeProviderSnapshot(
        {
          account_id: 'provider-account',
          mask: '1234',
          credential: 'must-not-persist',
          newly_added_private_value: 'must-not-persist',
        },
        'account',
      ),
    ).toEqual({ account_id: 'provider-account', mask: '1234' });
  });

  it('applies a nested allowlist to retained provider structures', () => {
    expect(
      sanitizeProviderSnapshot(
        {
          balances: {
            current: 100,
            iso_currency_code: 'GBP',
            api_key: 'must-not-persist',
          },
        },
        'account',
      ),
    ).toEqual({
      balances: { current: 100, iso_currency_code: 'GBP' },
    });
  });

  it('keeps institution diagnostics without persisting provider secrets', () => {
    expect(
      sanitizeProviderSnapshot(
        {
          institution_id: 'ins_123',
          name: 'Example Bank',
          country_codes: ['GB'],
          oauth: true,
          access_token: 'must-not-persist',
        },
        'institution',
      ),
    ).toEqual({
      institution_id: 'ins_123',
      name: 'Example Bank',
      country_codes: ['GB'],
      oauth: true,
    });
  });
});
