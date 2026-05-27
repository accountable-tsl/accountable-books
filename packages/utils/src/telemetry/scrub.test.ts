import { describe, expect, it } from 'vitest';

import { scrubForTelemetry } from './scrub.js';

describe('scrubForTelemetry (shared)', () => {
  it('redacts email and names in signup-shaped payloads', () => {
    const result = scrubForTelemetry({
      user: {
        email: 'a@b.com',
        firstname: 'Temi',
        password: 'secret',
      },
      company_id: 'uuid-ok',
    });
    expect(result).toEqual({
      user: {
        email: '[REDACTED]',
        firstname: '[REDACTED]',
        password: '[REDACTED]',
      },
      company_id: 'uuid-ok',
    });
  });
});
