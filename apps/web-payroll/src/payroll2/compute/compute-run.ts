import type { PayrollComputedRun, PayrollRun } from '../domain';

import { pickPeriodForMonth } from './periods';
import {
  addMicros,
  divRoundMicros,
  formatMicrosToMoney,
  parseMoneyToMicros,
  subMicros,
} from './money';

function monthKeyForRun(run: PayrollRun): string {
  return `${run.periodYear}-${String(run.periodMonth).padStart(2, '0')}`;
}

function sumMoneyStrings(values: Array<string | undefined>): bigint {
  return values.reduce((acc, v) => {
    if (!v) return acc;
    return addMicros(acc, parseMoneyToMicros(v));
  }, 0n);
}

export function computeRun(run: PayrollRun, options?: { nowIso?: string }): PayrollComputedRun {
  const monthKey = monthKeyForRun(run);
  const computedAt = options?.nowIso ?? new Date().toISOString();

  let grossTotal = 0n;
  let netTotal = 0n;
  let payeTotal = 0n;
  let employeeCount = 0;

  const items = run.items.map((runItem) => {
    employeeCount += 1;

    const comp = pickPeriodForMonth(runItem.payProfileSnapshot.compensationHistory, monthKey);
    if (!comp) {
      throw new Error(`Missing compensation for ${runItem.employeeSnapshot.fullName} in ${monthKey}`);
    }

    const annualGross = parseMoneyToMicros(comp.annualGross);
    const monthlyGross = divRoundMicros(annualGross, 12n);

    const oneOffAllowances = (runItem.edits?.oneOffAllowances ?? []).map((a) => a.amount);
    const recurringDeductions = (runItem.payProfileSnapshot.recurringDeductions ?? [])
      .filter((d) =>
        d.fromMonth <= monthKey && (d.toMonth == null || monthKey <= d.toMonth),
      )
      .map((d) => d.amount);

    const oneOffDeductions = (runItem.edits?.oneOffDeductions ?? []).map((d) => d.amount);

    const grossWithOneOffs = addMicros(monthlyGross, sumMoneyStrings(oneOffAllowances));
    const totalDeductions = sumMoneyStrings([...recurringDeductions, ...oneOffDeductions]);

    // Placeholder: PAYE computation comes next; for now assume 0.
    const paye = 0n;

    const netPay = subMicros(subMicros(grossWithOneOffs, totalDeductions), paye);

    grossTotal = addMicros(grossTotal, grossWithOneOffs);
    netTotal = addMicros(netTotal, netPay);
    payeTotal = addMicros(payeTotal, paye);

    return {
      runItemId: runItem.id,
      gross: formatMicrosToMoney(grossWithOneOffs),
      paye: formatMicrosToMoney(paye),
      totalDeductions: formatMicrosToMoney(totalDeductions),
      netPay: formatMicrosToMoney(netPay),
    };
  });

  return {
    computedAt,
    totals: {
      employeeCount,
      grossTotal: formatMicrosToMoney(grossTotal),
      netTotal: formatMicrosToMoney(netTotal),
      payeTotal: formatMicrosToMoney(payeTotal),
    },
    items,
  };
}
