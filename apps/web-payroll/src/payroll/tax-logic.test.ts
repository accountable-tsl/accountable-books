import { describe, expect, it } from 'vitest';

import {
  computeEmployeeMonthInputs,
  computeNigeriaCumulativePayeForMonth,
  getEmployeeDeductionsForMonth,
  getEmployerContributionsForMonth,
} from './tax-logic';

import type { Employee } from './tax-logic';

describe('tax-logic period resolution', () => {
  it('selects the single matching compensation period for a month', () => {
    const employee: Employee = {
      id: 'e1',
      name: 'Test',
      state: 'LAGOS',
      compensation: [
        { fromMonth: '2026-01', toMonth: '2026-06', annualGross: 12000000 },
        { fromMonth: '2026-07', annualGross: 15000000 },
      ],
    };

    const jan = computeEmployeeMonthInputs(employee, '2026-01');
    const aug = computeEmployeeMonthInputs(employee, '2026-08');

    expect(jan.compensation.annualGross).toBe(12000000);
    expect(aug.compensation.annualGross).toBe(15000000);
  });

  it('throws on overlapping compensation periods', () => {
    const employee: Employee = {
      id: 'e1',
      name: 'Test',
      state: 'LAGOS',
      compensation: [
        { fromMonth: '2026-01', toMonth: '2026-06', annualGross: 12000000 },
        { fromMonth: '2026-05', toMonth: '2026-08', annualGross: 15000000 },
      ],
    };

    expect(() => computeEmployeeMonthInputs(employee, '2026-05')).toThrow(
      /Overlapping compensation periods/,
    );
  });
});

describe('deductions scheduling', () => {
  it('expands monthly vs once correctly for a given month', () => {
    const employee: Employee = {
      id: 'e1',
      name: 'Test',
      state: 'LAGOS',
      compensation: [{ fromMonth: '2026-01', annualGross: 12000000 }],
      allowableDeductions: [
        {
          type: 'life_insurance_premium',
          frequency: 'monthly',
          amount: 12000,
          fromMonth: '2026-02',
          toMonth: '2026-04',
        },
        {
          type: 'pension_additional',
          frequency: 'once',
          amount: 150000,
          fromMonth: '2026-03',
        },
      ],
    };

    expect(getEmployeeDeductionsForMonth(employee, '2026-01')).toEqual({
      pension_additional: 0,
      nhis_additional: 0,
      owner_occupied_mortgage_interest: 0,
      life_insurance_premium: 0,
    });

    expect(getEmployeeDeductionsForMonth(employee, '2026-02')).toMatchObject({
      life_insurance_premium: 12000,
      pension_additional: 0,
    });

    expect(getEmployeeDeductionsForMonth(employee, '2026-03')).toMatchObject({
      life_insurance_premium: 12000,
      pension_additional: 150000,
    });

    expect(getEmployeeDeductionsForMonth(employee, '2026-05')).toMatchObject({
      life_insurance_premium: 0,
      pension_additional: 0,
    });
  });
});

describe('employer contributions scheduling', () => {
  it('expands monthly vs once correctly for a given month', () => {
    const employee: Employee = {
      id: 'e1',
      name: 'Test',
      state: 'LAGOS',
      compensation: [{ fromMonth: '2026-01', annualGross: 12000000 }],
      employerVoluntaryContributions: [
        {
          type: 'pension_voluntary',
          frequency: 'monthly',
          amount: 25000,
          fromMonth: '2026-02',
          toMonth: '2026-04',
        },
        {
          type: 'nhis_voluntary',
          frequency: 'once',
          amount: 120000,
          fromMonth: '2026-03',
        },
      ],
    };

    expect(getEmployerContributionsForMonth(employee, '2026-01')).toEqual({
      nhis_voluntary: 0,
      pension_voluntary: 0,
    });

    expect(getEmployerContributionsForMonth(employee, '2026-02')).toMatchObject({
      pension_voluntary: 25000,
      nhis_voluntary: 0,
    });

    expect(getEmployerContributionsForMonth(employee, '2026-03')).toMatchObject({
      pension_voluntary: 25000,
      nhis_voluntary: 120000,
    });

    expect(getEmployerContributionsForMonth(employee, '2026-05')).toMatchObject({
      pension_voluntary: 0,
      nhis_voluntary: 0,
    });
  });
});

describe('company statutory rate policy', () => {
  it('uses company pension rates when provided (and valid)', () => {
    const employee: Employee = {
      id: 'e1',
      name: 'Test',
      state: 'LAGOS',
      compensation: [
        {
          fromMonth: '2026-01',
          annualGross: 12000000, // 1,000,000 / month
          breakdown: {
            breakdownType: 'percentage',
            basicValue: 0.4,
            housingValue: 0.4,
            transportValue: 0.1,
          },
        },
      ],
      statutory: [{ fromMonth: '2026-01', hasPension: true, hasNHF: false, hasNHIS: false }],
    };

    const inputs = computeEmployeeMonthInputs(employee, '2026-01', {
      pensionRates: { employeeRate: 0.09, employerRate: 0.12 }, // total 21% (>= 18%), employer >= 10%
    });

    // pensionBase = (basic+housing+transport) monthly
    // = 1,000,000 * (0.4 + 0.4 + 0.1) = 900,000
    expect(Math.round(inputs.statutory.eePension)).toBe(81_000);
    expect(Math.round(inputs.statutory.erPension)).toBe(108_000);
  });

  it('rejects pension rates when employer is below 10%', () => {
    const employee: Employee = {
      id: 'e1',
      name: 'Test',
      state: 'LAGOS',
      compensation: [{ fromMonth: '2026-01', annualGross: 12000000 }],
      statutory: [{ fromMonth: '2026-01', hasPension: true, hasNHF: false, hasNHIS: false }],
    };

    expect(() =>
      computeEmployeeMonthInputs(employee, '2026-01', {
        pensionRates: { employeeRate: 0.08, employerRate: 0.09 },
      }),
    ).toThrow(/employerRate must be at least 0\.1/);
  });

  it('rejects pension rates when total is below 18%', () => {
    const employee: Employee = {
      id: 'e1',
      name: 'Test',
      state: 'LAGOS',
      compensation: [{ fromMonth: '2026-01', annualGross: 12000000 }],
      statutory: [{ fromMonth: '2026-01', hasPension: true, hasNHF: false, hasNHIS: false }],
    };

    expect(() =>
      computeEmployeeMonthInputs(employee, '2026-01', {
        pensionRates: { employeeRate: 0.05, employerRate: 0.1 },
      }),
    ).toThrow(/employeeRate \+ employerRate must be at least 0\.18/);
  });

  it('uses company NHIS rates when provided (and valid)', () => {
    const employee: Employee = {
      id: 'e1',
      name: 'Test',
      state: 'LAGOS',
      compensation: [
        {
          fromMonth: '2026-01',
          annualGross: 12000000, // 1,000,000 / month
          breakdown: {
            breakdownType: 'percentage',
            basicValue: 0.4,
            housingValue: 0.4,
            transportValue: 0.1,
          },
        },
      ],
      statutory: [{ fromMonth: '2026-01', hasPension: false, hasNHF: false, hasNHIS: true }],
    };

    const inputs = computeEmployeeMonthInputs(employee, '2026-01', {
      nhisRates: { employeeRate: 0.05, employerRate: 0.1 }, // total 15%, employer >= 10%
    });

    // NHIS base is monthlyBasic (per current model): 1,000,000 * 0.4 = 400,000
    expect(Math.round(inputs.statutory.eeNhis)).toBe(20_000);
    expect(Math.round(inputs.statutory.erNhis)).toBe(40_000);
  });

  it('rejects NHIS rates when employer is below 10%', () => {
    const employee: Employee = {
      id: 'e1',
      name: 'Test',
      state: 'LAGOS',
      compensation: [{ fromMonth: '2026-01', annualGross: 12000000 }],
      statutory: [{ fromMonth: '2026-01', hasPension: false, hasNHF: false, hasNHIS: true }],
    };

    expect(() =>
      computeEmployeeMonthInputs(employee, '2026-01', {
        nhisRates: { employeeRate: 0.05, employerRate: 0.09 },
      }),
    ).toThrow(/employerRate must be at least 0\.1/);
  });

  it('rejects NHIS rates when total is below 15%', () => {
    const employee: Employee = {
      id: 'e1',
      name: 'Test',
      state: 'LAGOS',
      compensation: [{ fromMonth: '2026-01', annualGross: 12000000 }],
      statutory: [{ fromMonth: '2026-01', hasPension: false, hasNHF: false, hasNHIS: true }],
    };

    expect(() =>
      computeEmployeeMonthInputs(employee, '2026-01', {
        nhisRates: { employeeRate: 0.04, employerRate: 0.1 },
      }),
    ).toThrow(/employeeRate \+ employerRate must be at least 0\.15/);
  });

  it('uses employee-specific pension override for the period (over company defaults)', () => {
    const employee: Employee = {
      id: 'e1',
      name: 'Test',
      state: 'LAGOS',
      compensation: [
        {
          fromMonth: '2026-01',
          annualGross: 12000000, // 1,000,000 / month
          breakdown: {
            breakdownType: 'percentage',
            basicValue: 0.4,
            housingValue: 0.4,
            transportValue: 0.1,
          },
        },
      ],
      statutory: [
        {
          fromMonth: '2026-01',
          hasPension: true,
          hasNHF: false,
          hasNHIS: false,
          pensionRates: { employeeRate: 0.08, employerRate: 0.15 }, // total 23%
        },
      ],
    };

    const inputs = computeEmployeeMonthInputs(employee, '2026-01', {
      pensionRates: { employeeRate: 0.09, employerRate: 0.12 },
    });

    // base = 900,000; 8% => 72,000; 15% => 135,000
    expect(Math.round(inputs.statutory.eePension)).toBe(72_000);
    expect(Math.round(inputs.statutory.erPension)).toBe(135_000);
  });

  it('uses employee-specific NHIS override for the period (over company defaults)', () => {
    const employee: Employee = {
      id: 'e1',
      name: 'Test',
      state: 'LAGOS',
      compensation: [
        {
          fromMonth: '2026-01',
          annualGross: 12000000, // 1,000,000 / month
          breakdown: {
            breakdownType: 'percentage',
            basicValue: 0.4,
            housingValue: 0.4,
            transportValue: 0.1,
          },
        },
      ],
      statutory: [
        {
          fromMonth: '2026-01',
          hasPension: false,
          hasNHF: false,
          hasNHIS: true,
          nhisRates: { employeeRate: 0.2, employerRate: 0.1 }, // total 30%
        },
      ],
    };

    const inputs = computeEmployeeMonthInputs(employee, '2026-01', {
      nhisRates: { employeeRate: 0.05, employerRate: 0.1 },
    });

    // NHIS base = monthlyBasic = 400,000; 20% => 80,000; 10% => 40,000
    expect(Math.round(inputs.statutory.eeNhis)).toBe(80_000);
    expect(Math.round(inputs.statutory.erNhis)).toBe(40_000);
  });

  it('uses standard NHIS rates by default when NHIS is enabled (5% employee, 10% employer)', () => {
    const employee: Employee = {
      id: 'e1',
      name: 'Test',
      state: 'LAGOS',
      compensation: [
        {
          fromMonth: '2026-01',
          annualGross: 12000000, // 1,000,000 / month
          breakdown: {
            breakdownType: 'percentage',
            basicValue: 0.4,
            housingValue: 0.4,
            transportValue: 0.1,
          },
        },
      ],
      statutory: [{ fromMonth: '2026-01', hasPension: false, hasNHF: false, hasNHIS: true }],
    };

    const inputs = computeEmployeeMonthInputs(employee, '2026-01');
    // base = 400,000; ee=5% => 20,000; er=10% => 40,000
    expect(Math.round(inputs.statutory.eeNhis)).toBe(20_000);
    expect(Math.round(inputs.statutory.erNhis)).toBe(40_000);
  });
});

describe('Nigeria cumulative PAYE annualisation', () => {
  it('annualises YTD gross when income changes mid-year', () => {
    const employee: Employee = {
      id: 'e1',
      name: 'Test',
      state: 'LAGOS',
      compensation: [
        { fromMonth: '2026-01', toMonth: '2026-03', annualGross: 6000000 }, // 500k/month
        { fromMonth: '2026-04', toMonth: '2026-12', annualGross: 12000000 }, // 1m/month
      ],
    };

    const march = computeNigeriaCumulativePayeForMonth(employee, '2026-03');
    const april = computeNigeriaCumulativePayeForMonth(employee, '2026-04');

    expect(Math.round(march.projectedAnnualGross)).toBe(6_000_000);
    expect(Math.round(april.projectedAnnualGross)).toBe(7_500_000);
  });

  it('handles join date by annualising over months worked (not Jan..month)', () => {
    const employee: Employee = {
      id: 'e1',
      name: 'Test',
      state: 'LAGOS',
      joinDate: '2026-03-01',
      compensation: [{ fromMonth: '2026-03', annualGross: 6000000 }], // 500k/month
    };

    const march = computeNigeriaCumulativePayeForMonth(employee, '2026-03');
    expect(Math.round(march.projectedAnnualGross)).toBe(6_000_000);
  });

  it('supports full-month proration (no decimals) when join/exit exists', () => {
    const employee: Employee = {
      id: 'e1',
      name: 'Test',
      state: 'LAGOS',
      joinDate: '2026-03-20',
      compensation: [{ fromMonth: '2026-03', annualGross: 6000000 }], // 500k/month
    };

    const inputs = computeEmployeeMonthInputs(employee, '2026-03', undefined, {
      employmentProrationMethod: 'full_month',
    });

    expect(inputs.compensation.employmentFraction).toBe(1);
    expect(inputs.compensation.monthlyGross).toBeCloseTo(500_000);
  });

  it('does not annualise one-off deductions', () => {
    const employee: Employee = {
      id: 'e1',
      name: 'Test',
      state: 'LAGOS',
      compensation: [{ fromMonth: '2026-01', annualGross: 6000000 }],
      allowableDeductions: [
        {
          type: 'life_insurance_premium',
          frequency: 'once',
          amount: 120000,
          fromMonth: '2026-02',
        },
      ],
    };

    const feb = computeNigeriaCumulativePayeForMonth(employee, '2026-02');
    expect(Math.round(feb.allowableOneOffYtd)).toBe(120_000);
    expect(
      Math.round(feb.projectedAnnualAllowableTotal),
    ).toBeGreaterThanOrEqual(120_000);
  });
});
