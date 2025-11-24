import './test-env.js';
import { describe, expect, it } from 'vitest';
import { RuleCompiler, RuleCompilerError } from './rules.compiler.js';

const baseTxn = {
  companyId: 'company-1',
  transactionId: 'txn-1',
  transactionDate: '2025-01-20',
  amount: -105,
  direction: 'outflow' as const,
  description: 'VAT payment',
  metadata: { signals: { likely_split: true } },
};

describe('RuleCompiler advanced features', () => {
  const compiler = new RuleCompiler();

  it('rejects signal conditions when allowSignals is false', () => {
    const definition = {
      logic: 'all',
      conditions: [
        {
          type: 'signal',
          field: 'likely_split',
          operator: 'is_true',
        },
      ],
    };

    expect(() =>
      compiler.compileCondition('sig-no', definition as any, {
        allowSignals: false,
      }),
    ).toThrow(RuleCompilerError);
  });

  it('evaluates signal conditions when enabled', () => {
    const definition = {
      logic: 'all',
      conditions: [
        {
          type: 'signal',
          field: 'likely_split',
          operator: 'is_true',
        },
      ],
    };
    const compiled = compiler.compileCondition('sig-yes', definition as any, {
      allowSignals: true,
    });
    const result = compiled.evaluate(baseTxn);
    expect(result.matched).toBe(true);
    expect(result.trace[0]).toMatchObject({
      kind: 'signal',
      success: true,
    });
  });

  it('rejects template actions when allowTemplates is false', () => {
    const definition = {
      actions: [
        {
          type: 'apply_template',
          template: 'vat_split',
          params: {
            net_coa_id: '0b1fb519-2a3f-4b83-a5f6-f73f93293464',
            vat_coa_id: '1802b1c3-2ba0-47ed-92ee-f9a026d4ec06',
            vat_rate: 0.05,
          },
        },
      ],
    };

    expect(() =>
      compiler.compileAction('tmpl-no', definition as any, {
        allowTemplates: false,
      }),
    ).toThrow(RuleCompilerError);
  });

  it('applies templates when enabled', () => {
    const definition = {
      actions: [
        {
          type: 'apply_template',
          template: 'vat_split',
          params: {
            net_coa_id: '0b1fb519-2a3f-4b83-a5f6-f73f93293464',
            vat_coa_id: '1802b1c3-2ba0-47ed-92ee-f9a026d4ec06',
            vat_rate: 0.05,
            net_description: 'Net',
            vat_description: 'VAT',
          },
        },
      ],
    };
    const compiled = compiler.compileAction('tmpl-yes', definition as any, {
      allowTemplates: true,
    });
    const result = compiled.execute({}, baseTxn);
    expect(result.nextDraft.categorize).toHaveLength(2);
    expect(result.trace[0]).toMatchObject({
      type: 'template',
      template: 'vat_split',
    });
  });
});
