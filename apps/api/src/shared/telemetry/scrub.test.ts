import { describe, expect, it } from 'vitest';

import { scrubForTelemetry, scrubSentryUser } from './scrub.js';

describe('scrubForTelemetry', () => {
  it('redacts top-level sensitive keys', () => {
    const result = scrubForTelemetry({
      password: 'secret123',
      email: 'a@b.com',
    });
    expect(result).toEqual({
      password: '[REDACTED]',
      email: '[REDACTED]',
    });
  });

  it('redacts nested sensitive keys', () => {
    const result = scrubForTelemetry({
      user: { email: 'a@b.com', password: 'hunter2' },
      company: { name: 'Acme' },
    });
    expect(result).toEqual({
      user: { email: '[REDACTED]', password: '[REDACTED]' },
      company: { name: '[REDACTED]' },
    });
  });

  it('redacts camelCase sensitive keys', () => {
    const result = scrubForTelemetry({
      verificationToken: 'abc123',
      refreshToken: 'xyz',
      accessToken: 'tok',
      apiKey: 'key',
      privateKey: 'pem',
    });
    expect(result).toEqual({
      verificationToken: '[REDACTED]',
      refreshToken: '[REDACTED]',
      accessToken: '[REDACTED]',
      apiKey: '[REDACTED]',
      privateKey: '[REDACTED]',
    });
  });

  it('redacts snake_case sensitive keys', () => {
    const result = scrubForTelemetry({
      verification_token: 'abc123',
      refresh_token: 'xyz',
      access_token: 'tok',
      api_key: 'key',
      account_number: '12345678',
      sort_code: '20-00-00',
      tax_id: 'GB123456789',
      card_number: '4111111111111111',
    });
    expect(result).toEqual({
      verification_token: '[REDACTED]',
      refresh_token: '[REDACTED]',
      access_token: '[REDACTED]',
      api_key: '[REDACTED]',
      account_number: '[REDACTED]',
      sort_code: '[REDACTED]',
      tax_id: '[REDACTED]',
      card_number: '[REDACTED]',
    });
  });

  it('redacts financial fields', () => {
    const result = scrubForTelemetry({
      amount: 100.5,
      balance: 200,
      description: 'Wire transfer',
      memo: 'Rent',
    });
    expect(result).toEqual({
      amount: '[REDACTED]',
      balance: '[REDACTED]',
      description: '[REDACTED]',
      memo: '[REDACTED]',
    });
  });

  it('handles arrays by scrubbing each element', () => {
    const result = scrubForTelemetry([
      { password: 'a', name: 'Alice' },
      { password: 'b', name: 'Bob' },
    ]);
    expect(result).toEqual([
      { password: '[REDACTED]', name: '[REDACTED]' },
      { password: '[REDACTED]', name: '[REDACTED]' },
    ]);
  });

  it('passes through primitives and nulls unchanged', () => {
    expect(scrubForTelemetry(null)).toBeNull();
    expect(scrubForTelemetry(undefined)).toBeUndefined();
    expect(scrubForTelemetry(42)).toBe(42);
    expect(scrubForTelemetry('hello')).toBe('hello');
    expect(scrubForTelemetry(true)).toBe(true);
  });

  it('preserves non-sensitive keys at all levels', () => {
    const input = {
      company_type: 'accounting_firm',
      method: 'direct',
      count: 5,
    };
    expect(scrubForTelemetry(input)).toEqual(input);
  });

  it('matches the real signup input shape — PII and secrets redacted', () => {
    const signupInput = {
      user: {
        email: 'temi@example.com',
        password: 'SuperSecret99!',
        firstname: 'Temi',
        lastname: 'A',
        user_type: 'individual',
      },
      company: {
        name: 'My Biz',
        type: 'individual',
      },
    };
    const result = scrubForTelemetry(signupInput);
    expect((result.user as Record<string, unknown>).password).toBe(
      '[REDACTED]',
    );
    expect((result.user as Record<string, unknown>).email).toBe('[REDACTED]');
    expect((result.user as Record<string, unknown>).firstname).toBe(
      '[REDACTED]',
    );
    expect((result.user as Record<string, unknown>).lastname).toBe(
      '[REDACTED]',
    );
    expect((result.user as Record<string, unknown>).user_type).toBe(
      'individual',
    );
    expect((result.company as Record<string, unknown>).name).toBe('[REDACTED]');
    expect((result.company as Record<string, unknown>).type).toBe('individual');
  });

  it('does not mutate the original object', () => {
    const input = { password: 'keep-me', name: 'Alice' };
    scrubForTelemetry(input);
    expect(input.password).toBe('keep-me');
  });

  it('handles deeply nested objects without blowing the stack', () => {
    let deep: Record<string, unknown> = { password: 'deep-secret' };
    for (let i = 0; i < 12; i++) deep = { nested: deep };
    expect(() => scrubForTelemetry(deep)).not.toThrow();
  });
});

describe('scrubSentryUser', () => {
  it('removes email, username, ip_address, and name', () => {
    expect(
      scrubSentryUser({
        email: 'a@b.com',
        username: 'temi',
        ip_address: '1.2.3.4',
        name: 'Temi A',
        id: 'user-1',
      }),
    ).toEqual({ id: 'user-1' });
  });

  it('returns undefined when only PII fields were present', () => {
    expect(
      scrubSentryUser({
        email: 'a@b.com',
        name: 'Temi',
      }),
    ).toBeUndefined();
  });
});
