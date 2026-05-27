import { describe, expect, it } from 'vitest';

import {
  renderPlaceholders,
  validatePlaceholdersInFields,
} from '../recurring-templates.placeholders.js';

describe('recurring templates placeholders', () => {
  it('rejects invalid placeholder tokens', () => {
    const result = validatePlaceholdersInFields([
      'Rent [Month Year]',
      'Invalid [Foo]',
      '[Day+1]',
    ]);
    expect(result.valid).toBe(false);
    expect(result.invalidTokens).toContain('[Foo]');
  });

  it('renders month and month-year tokens', () => {
    const output = renderPlaceholders(
      'Rent for [Month Year]',
      '2026-04-15',
      'UTC',
    );
    expect(output).toBe('Rent for April 2026');
  });

  it('renders week-year tokens using ISO week', () => {
    const output = renderPlaceholders('Week [Week Year]', '2026-04-15', 'UTC');
    expect(output).toBe('Week 2026-W16');
  });

  it('applies offsets for month tokens', () => {
    const output = renderPlaceholders(
      'Next month: [Month+1]',
      '2026-04-15',
      'UTC',
    );
    expect(output).toBe('Next month: May');
  });
});
