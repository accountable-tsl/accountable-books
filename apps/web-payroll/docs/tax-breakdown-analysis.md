# Tax Breakdown Analysis - What's Missing

## Current State

### What We're Storing (PayrollComputedItem)
- ✅ `gross` - Monthly gross income
- ✅ `taxableIncome` - **BUT it's just set to monthlyGross, not actual taxable income**
- ✅ `paye` - Final PAYE amount
- ✅ Statutory deductions (pension, NHF, NHIS)
- ✅ `totalDeductions` - All deductions
- ✅ `netPay` - Net pay
- ✅ `employerCost` - Employer cost
- ✅ `breakdown` - Only basic/housing/transport split

### What's Missing for Complete Tax Breakdown

#### 1. **YTD Calculation Details** (if YTD was used)
- ❌ YTD taxable gross (sum of all months)
- ❌ YTD allowable deductions
- ❌ YTD tax withheld (from prior months)
- ❌ Worked month units YTD
- ❌ Projected annual gross
- ❌ Projected annual allowable deductions
- ❌ Whether YTD or non-YTD flow was used

#### 2. **Exempt Income Breakdown**
- ❌ Death/injury compensation amount
- ❌ Redundancy payment amount
- ❌ Loss of employment benefit:
  - ❌ Total amount received
  - ❌ Exempt portion (up to N50M)
  - ❌ Taxable portion (above N50M)

#### 3. **Allowable Deductions Breakdown**
- ❌ Statutory deductions (pension, NHF, NHIS) - **we have totals but not breakdown**
- ❌ Voluntary pension contributions (recurring + one-off)
- ❌ Voluntary NHF contributions (recurring + one-off)
- ❌ Voluntary NHIS contributions (recurring + one-off)
- ❌ Owner-occupied mortgage interest (recurring + one-off)
- ❌ Life insurance premiums (recurring + one-off)
- ❌ Which deductions are recurring vs one-off

#### 4. **Rent Relief Details**
- ❌ Annual rent paid (we compute it but don't store it)
- ❌ Rent relief amount (20% capped at 500k)
- ❌ Whether rent relief was applied

#### 5. **Tax Calculation Details**
- ❌ Annual taxable income (gross - rent relief - allowable deductions)
- ❌ Tax bands applied (which bands, how much in each)
- ❌ Annual tax computed
- ❌ Tax due YTD (if YTD flow)
- ❌ Tax already withheld YTD
- ❌ Current month PAYE calculation

#### 6. **One-Off Allowances Breakdown**
- ❌ Total one-off allowances
- ❌ Taxable one-off allowances
- ❌ Exempt one-off allowances (by type)

#### 7. **Employment Details**
- ❌ Employment fraction (for proration)
- ❌ Whether proration was applied

## Impact

**Without this data, we CANNOT:**
1. Show employees how their tax was calculated step-by-step
2. Explain why their tax changed from month to month
3. Show YTD totals and projections
4. Demonstrate compliance with tax law
5. Provide audit trail for tax authorities
6. Help employees understand their tax position

## Recommendation

We need to add a `taxBreakdown` field to `PayrollComputedItemSchema` that contains all the details needed for a complete explanation.
