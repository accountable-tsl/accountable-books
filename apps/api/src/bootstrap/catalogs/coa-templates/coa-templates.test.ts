import { describe, expect, it } from 'vitest';

import {
  loadCoaTemplateCatalog,
  normalizeCoaTemplateCatalogRows,
} from './coa-templates.js';

const validRawRow = {
  template_name: 'biz:none:basic:nocode:v1',
  code: '',
  name: 'Revenue',
  description: 'Revenue from normal business activities',
  account_type_key: 'rev_revenue',
  locked: '',
};

describe('bootstrap COA template catalog', () => {
  it('loads the canonical CSV with normalized, valid rows', async () => {
    const result = await loadCoaTemplateCatalog();

    expect(result.rowsRead).toBe(714);
    expect(result.rows).toHaveLength(714);
    expect(result.templates).toEqual([
      'acc:prof:basic:code:v1',
      'acc:prof:basic:nocode:v1',
      'biz:int_design:adv:code:v1',
      'biz:int_design:adv:nocode:v1',
      'biz:none:basic:nocode:v1',
      'biz:saas:basic:code:v1',
      'biz:saas:basic:nocode:v1',
      'ind:none:basic:nocode:v1',
    ]);
    expect(result.accountTypeKeysUsed).toHaveLength(65);

    for (const row of result.rows) {
      expect(row.template_name).toMatch(
        /^(ind|biz|acc):[a-z][a-z0-9_]*:(basic|adv|pro):(code|nocode|none):v[1-9]\d*$/,
      );
      expect(row.name.trim()).toBe(row.name);
      expect(row.description === null || row.description.trim()).toBe(
        row.description,
      );
      expect(typeof row.is_active).toBe('boolean');
      expect(typeof row.locked).toBe('boolean');
    }
  });

  it('normalizes blank optional values', () => {
    const [row] = normalizeCoaTemplateCatalogRows([validRawRow]);

    expect(row.code).toBeNull();
    expect(row.locked).toBe(false);
    expect(row.is_active).toBe(true);
  });

  it('rejects duplicate natural keys', () => {
    expect(() =>
      normalizeCoaTemplateCatalogRows([validRawRow, validRawRow]),
    ).toThrow(/duplicate rows/i);
  });

  it('rejects unknown account type keys', () => {
    expect(() =>
      normalizeCoaTemplateCatalogRows([
        {
          ...validRawRow,
          account_type_key: 'not_a_real_account_type',
        },
      ]),
    ).toThrow(/unknown account_type_key/i);
  });
});
