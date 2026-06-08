import { describe, expect, it } from 'vitest';

import { newBankInput } from './banks.types.js';

describe('newBankInput', () => {
  it('normalizes valid bank input', () => {
    const parsed = newBankInput.parse({
      key: ' NG_Test_Bank ',
      display_name: ' Test Bank ',
      country: 'ng',
      swift_code: 'abcdngla',
      local_code: ' 123 ',
      local_code_type: 'nip_code',
    });

    expect(parsed).toMatchObject({
      key: 'ng_test_bank',
      display_name: 'Test Bank',
      country: 'NG',
      swift_code: 'ABCDNGLA',
      local_code: '123',
      local_code_type: 'nip_code',
    });
  });

  it('requires local code and type together', () => {
    const result = newBankInput.safeParse({
      key: 'ng_test_bank',
      display_name: 'Test Bank',
      country: 'NG',
      local_code: '123',
    });

    expect(result.success).toBe(false);
  });

  it('rejects malformed SWIFT codes', () => {
    const result = newBankInput.safeParse({
      key: 'ng_test_bank',
      display_name: 'Test Bank',
      country: 'NG',
      swift_code: 'not-a-swift-code',
    });

    expect(result.success).toBe(false);
  });
});
