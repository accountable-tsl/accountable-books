import { toDate } from '../../../shared/index.js';
import { fiscalCalendarService } from '../../reporting/fiscal-calendar/fiscal-calendar.service.js';

import type { PatternSignals, Temporal } from './enrichment.types.js';

/**
 * Detect pattern signals from transaction description and amount
 * Returns flags for likely splits, tax, FX, prepayments, etc.
 */
export function detectPatternSignals({
  description,
  amount,
  transactionCurrencyCode,
  bankAccountCurrencyCode,
}: {
  description: string;
  amount: number;
  transactionCurrencyCode: string;
  bankAccountCurrencyCode: string;
}): PatternSignals {
  const descUpper = description.toUpperCase();
  const notes: string[] = [];

  // Split transaction keywords
  const splitKeywords = [
    'SPLIT',
    'PARTIAL',
    'INSTALLMENT',
    'PAYMENT 1 OF',
    'PAYMENT 2 OF',
  ];
  const likely_split = splitKeywords.some((kw) => descUpper.includes(kw));
  if (likely_split) notes.push('Split transaction detected');

  // Transfer between accounts keywords
  const transferKeywords = [
    'TRANSFER',
    'TRF',
    'INTERNAL TRANSFER',
    'MOVE MONEY',
    'WALLET TOPUP',
    'WALLET TOP-UP',
  ];
  const likely_trf_btw_accounts = transferKeywords.some((kw) =>
    descUpper.includes(kw),
  );
  if (likely_trf_btw_accounts) notes.push('Inter-account transfer detected');

  // Tax keywords
  const taxKeywords = [
    'VAT',
    'TAX',
    'WHT',
    'WITHHOLDING',
    'PAYE',
    'HMRC',
    'IRS',
    'FIRS',
  ];
  const likely_tax = taxKeywords.some((kw) => descUpper.includes(kw));
  if (likely_tax) notes.push('Tax-related transaction detected');

  // Foreign exchange keywords
  const fxKeywords = [
    'FOREIGN EXCHANGE',
    'FX',
    'CURRENCY CONVERSION',
    'EXCHANGE RATE',
  ];
  const likely_fx = fxKeywords.some((kw) => descUpper.includes(kw));
  if (likely_fx) notes.push('FX transaction detected');

  // Prepayment keywords
  const prepaymentKeywords = [
    'PREPAYMENT',
    'ADVANCE',
    'DEPOSIT',
    'RETAINER',
    'ESCROW',
  ];
  const likely_prepayment = prepaymentKeywords.some((kw) =>
    descUpper.includes(kw),
  );
  if (likely_prepayment) notes.push('Prepayment/advance detected');

  // Recurring transaction pattern (simple heuristic - will be refined with historical data)
  const recurringKeywords = [
    'SUBSCRIPTION',
    'MONTHLY',
    'ANNUAL',
    'RECURRING',
    'AUTO-RENEWAL',
  ];
  const is_recurring = recurringKeywords.some((kw) => descUpper.includes(kw));
  if (is_recurring) notes.push('Recurring transaction pattern');

  // Anomaly detection (simple thresholds - will be enhanced with ML)
  const anomaly_detected = Math.abs(amount) > 1000000; // > 1M in base currency
  if (anomaly_detected) notes.push('Unusually large amount');

  // VAT check required (for certain countries)
  const requires_vat_check = likely_tax;

  // FX review required
  const requires_fx_review =
    bankAccountCurrencyCode !== transactionCurrencyCode || likely_fx;

  return {
    likely_split,
    likely_trf_btw_accounts,
    likely_tax,
    likely_fx,
    likely_prepayment,
    is_recurring,
    anomaly_detected,
    notes,
    requires_vat_check,
    requires_fx_review,
  };
}

const calculateFiscalPeriod = fiscalCalendarService.calculateFiscalPeriodYMD;

/**
 * Compute temporal features for a transaction date.
 * Conventions:
 * - day_of_week: 0–6 (Sunday = 0, JS default)
 * - day_of_month: 1–31
 * - month: 1–12 (calendar month number)
 * - quarter: 1–4 (calendar quarter)
 * - fiscal_quarter: 1–4 relative to the company’s fiscal year
 */
export function computeTemporalFeatures({
  txnDate,
  yearEndDay,
  yearEndMonth,
}: {
  txnDate: string;
  yearEndDay: number;
  yearEndMonth: number;
}): Temporal {
  const fy = calculateFiscalPeriod({
    ymd: txnDate,
    yearEndDay,
    yearEndMonth,
    periodType: 'yearly',
  });
  const { periodNumber: fyNum, startYMD: fyStart, endYMD: fyEnd } = fy;

  const fyMonth = calculateFiscalPeriod({
    ymd: txnDate,
    yearEndDay,
    yearEndMonth,
    periodType: 'monthly',
  });
  const {
    periodNumber: fyMonthNum,
    startYMD: fyMonthStart,
    endYMD: fyMonthEnd,
  } = fyMonth;

  const fyQuarter = calculateFiscalPeriod({
    ymd: txnDate,
    yearEndDay,
    yearEndMonth,
    periodType: 'quarterly',
  });
  const {
    periodNumber: fyQuarterNum,
    startYMD: fyQuarterStart,
    endYMD: fyQuarterEnd,
  } = fyQuarter;

  const tzDate = toDate(txnDate, 'start'); // Use TZ later

  // Calendar dates
  const day_of_week = tzDate.getDay(); // 0 = Sunday
  const day_of_month = tzDate.getDate();
  const monthNum = tzDate.getMonth() + 1; // 1-12

  // Calendar quarter
  const quarter = Math.ceil(monthNum / 3);

  return {
    day_of_week,
    day_of_month,
    calendar_month: monthNum,
    calendar_quarter: quarter,
    fiscal_month: fyMonthNum,
    fiscal_quarter: fyQuarterNum,
    fiscal_period: {
      year_start: fyStart,
      year_end: fyEnd,
      quarter_start: fyQuarterStart,
      quarter_end: fyQuarterEnd,
      month_start: fyMonthStart,
      month_end: fyMonthEnd,
    },
  };
}
