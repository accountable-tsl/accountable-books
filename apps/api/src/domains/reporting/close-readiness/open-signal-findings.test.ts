import { describe, expect, it } from 'vitest';

import { CLOSE_READINESS_RULES_BY_CODE } from './close-readiness.types.js';
import {
  buildRollupFactsHash,
  buildRollupFingerprint,
} from './open-signal-findings.js';
import { CLOSE_REVIEW_SIGNAL_METADATA } from './signals/close-signals.types.js';

const PERIOD = {
  companyId: '018f0000-0000-7000-8000-000000000001',
  fiscalYear: 2026,
  periodNumber: 6,
  periodType: 'monthly' as const,
};

describe('close review signal metadata', () => {
  it('points every surfaced signal at a real catalog finding code', () => {
    for (const meta of Object.values(CLOSE_REVIEW_SIGNAL_METADATA)) {
      expect(CLOSE_READINESS_RULES_BY_CODE.has(meta.rollupFindingCode)).toBe(
        true,
      );
    }
  });
});

describe('buildRollupFingerprint', () => {
  it('is stable regardless of related-account order', () => {
    const a = buildRollupFingerprint({
      ...PERIOD,
      findingCode: 'suspense_activity_review',
      relatedCoaIds: ['coa-b', 'coa-a'],
    });
    const b = buildRollupFingerprint({
      ...PERIOD,
      findingCode: 'suspense_activity_review',
      relatedCoaIds: ['coa-a', 'coa-b'],
    });

    expect(a).toBe(b);
  });

  it('differs by finding code', () => {
    const a = buildRollupFingerprint({
      ...PERIOD,
      findingCode: 'suspense_activity_review',
      relatedCoaIds: ['coa-a'],
    });
    const b = buildRollupFingerprint({
      ...PERIOD,
      findingCode: 'fixed_asset_depreciation_review',
      relatedCoaIds: ['coa-a'],
    });

    expect(a).not.toBe(b);
  });
});

describe('buildRollupFactsHash', () => {
  it('is order-independent over child facts hashes', () => {
    expect(buildRollupFactsHash(['h2', 'h1'])).toBe(
      buildRollupFactsHash(['h1', 'h2']),
    );
  });

  it('flips when a child facts hash changes (the invalidation guarantee)', () => {
    const before = buildRollupFactsHash(['h1', 'h2']);
    const after = buildRollupFactsHash(['h1', 'h2-edited']);

    expect(after).not.toBe(before);
  });

  it('flips when a child is added or removed', () => {
    const base = buildRollupFactsHash(['h1']);

    expect(buildRollupFactsHash(['h1', 'h2'])).not.toBe(base);
    expect(buildRollupFactsHash([])).not.toBe(base);
  });
});
