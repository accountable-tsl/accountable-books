import z from 'zod';
import type { RuleTransactionContext } from './rules.engine.types.js';
import type { CategorizeLine, TemplateName } from './rules-def.types.js';
import { RuleCompilerError } from './rules.compiler.js';

interface TemplateExecContext {
  params: Record<string, unknown>;
  txn: RuleTransactionContext;
}

interface TemplateResult {
  lines: CategorizeLine[];
}

type TemplateExecutor = (ctx: TemplateExecContext) => TemplateResult;

const vatSplitParams = z.object({
  net_coa_id: z.uuid(),
  vat_coa_id: z.uuid(),
  vat_rate: z.number().positive().max(1),
  net_description: z.string().optional(),
  vat_description: z.string().optional(),
});

const templates: Record<TemplateName, TemplateExecutor> = {
  vat_split: ({ params, txn }) => {
    const parsed = vatSplitParams.parse(params);
    const txnAmount = Math.abs(txn.amount ?? 0);
    if (!txnAmount) {
      throw new RuleCompilerError(
        'vat_split template requires non-zero transaction amount',
      );
    }
    const netAmount = roundCurrency(txnAmount / (1 + parsed.vat_rate));
    const vatAmount = roundCurrency(txnAmount - netAmount);
    const lines: CategorizeLine[] = [
      {
        split_type: 'amount',
        description: parsed.net_description ?? 'Net amount',
        coa_id: parsed.net_coa_id,
        value: netAmount,
      },
      {
        split_type: 'amount',
        description: parsed.vat_description ?? 'VAT component',
        coa_id: parsed.vat_coa_id,
        value: vatAmount,
      },
    ];
    return { lines };
  },
};

export function getActionTemplate(name: TemplateName): TemplateExecutor {
  const template = templates[name];
  if (!template) {
    throw new RuleCompilerError(`Unknown action template "${name}"`);
  }
  return template;
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}
