import { describe, expect, it } from 'vitest';

import {
  buildAliasMatcher,
  resolveDescriptionHeuristics,
} from './resolve-contact-heuristics.js';

const hisGraceAliases = buildAliasMatcher({
  aliases: ['HIS GRACE VENTURES', 'HIS GRACE VENTURES (ACCT2)'],
  primaryDisplayName: 'His Grace Ventures',
});

const logistocksAliases = buildAliasMatcher({
  aliases: ['LOGISTOCKS LIMITED'],
  primaryDisplayName: 'Logistocks Limited',
});

describe('resolveDescriptionHeuristics', () => {
  it('classifies sms alert charges as bank fees', () => {
    const result = resolveDescriptionHeuristics({
      companyId: 'company-1',
      description: 'SMS ALERT CHARGE OUTSTANDING',
      aliasInfo: hisGraceAliases,
      preferredContactType: 'unknown',
      countryCode: 'NG',
    });

    expect(result.reason).toBe('bank_fee');
    expect(result.contactName).toBe('BANK FEE · SMS ALERT CHARGE');
    expect(result.fingerprintSeed).toBe('bank_fee:sms_alert');
    expect(result.contactType).toBe('vendor');
  });

  it('groups VAT surcharge lines under a tax bucket', () => {
    const result = resolveDescriptionHeuristics({
      companyId: 'company-1',
      description: 'VAT ON RECOVERY FIXED CHRG:30-NOV-22 TO 30-DEC-22',
      aliasInfo: hisGraceAliases,
      preferredContactType: 'unknown',
      countryCode: 'NG',
      transactionAmount: 500,
    });

    expect(result.reason).toBe('tax');
    expect(result.contactName).toContain('BANK FEE TAX · RECOVERY FIXED CHRG');
    expect(result.contactType).toBe('vendor');
    expect(result.fingerprintSeed).toContain('tax_on_fee');
  });

  it('extracts sender metadata for inbound transfers', () => {
    const result = resolveDescriptionHeuristics({
      companyId: 'company-2',
      description:
        'NIP From 00001322020213083100002268 7169 GTBank Plc PAYREF:000022687169 SENDER: EBEN SPIFF JANE CHINYERE REMARK:',
      aliasInfo: hisGraceAliases,
      preferredContactType: 'unknown',
      countryCode: 'NG',
    });

    expect(result.reason).toBe('structured');
    expect(result.contactName).toContain('EBEN SPIFF JANE CHINYERE');
    expect(result.contactType).toBe('customer');
  });

  it('extracts counterparty from NIP FRM descriptions', () => {
    const result = resolveDescriptionHeuristics({
      companyId: 'company-2',
      description: 'NIP FRM AKERELE ADETOLA ENIOLA-USSD NI',
      aliasInfo: hisGraceAliases,
      preferredContactType: 'unknown',
      countryCode: 'NG',
    });

    expect(result.reason).toBe('structured');
    expect(result.contactName).toContain('AKERELE ADETOLA ENIOLA');
    expect(result.contactType).toBe('customer');
  });

  it('does not treat fee mirrors as real counterparties', () => {
    const result = resolveDescriptionHeuristics({
      companyId: 'company-3',
      description:
        'NIPFEE/SterlingPro Transfer to ACCOUNTABLE SERVICES (For Xero subscription)',
      aliasInfo: logistocksAliases,
      preferredContactType: 'unknown',
      countryCode: 'NG',
    });

    expect(result.reason).toBe('bank_fee');
    expect(result.contactName).toContain('BANK FEE');
    expect(result.contactType).toBe('vendor');
  });

  it('falls back to self-transfer buckets when only the company is referenced', () => {
    const result = resolveDescriptionHeuristics({
      companyId: 'company-4',
      description:
        'TRANSFER BETWEEN CUSTOMERS via Internet Banking from HIS GRACE VENTURES to HIS GRACE VENTURES (ACCT2)',
      aliasInfo: hisGraceAliases,
      preferredContactType: 'unknown',
      countryCode: 'NG',
    });

    expect(result.reason).toBe('self_transfer');
    expect(result.contactName).toContain('SELF TRANSFER');
    expect(result.contactType).toBe('internal');
    expect(result.fingerprintSeed).toBe('self-transfer:company-4');
  });

  it('uses country-specific ACH patterns for US transactions', () => {
    const result = resolveDescriptionHeuristics({
      companyId: 'company-us',
      description: 'ACH DEBIT TO ACME SOFTWARE INC PPD ID:123456',
      aliasInfo: logistocksAliases,
      preferredContactType: 'unknown',
      countryCode: 'US',
      transactionAmount: 45000,
    });

    expect(result.reason).toBe('structured');
    expect(result.contactName).toContain('ACME SOFTWARE INC');
    expect(result.contactType).toBe('vendor');
  });

  it('detects US-specific monthly service bank fees', () => {
    const result = resolveDescriptionHeuristics({
      companyId: 'company-us',
      description: 'MONTHLY SERVICE FEE - BUSINESS ADVANTAGE',
      aliasInfo: logistocksAliases,
      preferredContactType: 'unknown',
      countryCode: 'US',
    });

    expect(result.reason).toBe('bank_fee');
    expect(result.contactName).toContain('BANK FEE');
    expect(result.contactType).toBe('vendor');
  });

  it('extracts wire counterparties for US outgoing transfers', () => {
    const result = resolveDescriptionHeuristics({
      companyId: 'company-us',
      description: 'WIRE OUTGOING TO FUTURE VENTURES LLC REF 123456',
      aliasInfo: logistocksAliases,
      preferredContactType: 'unknown',
      countryCode: 'US',
    });

    expect(result.reason).toBe('structured');
    expect(result.contactName).toContain('FUTURE VENTURES LLC');
    expect(result.contactType).toBe('vendor');
  });

  it('treats large VAT lines as tax payments even in NG', () => {
    const result = resolveDescriptionHeuristics({
      companyId: 'company-5',
      description: 'VAT PAYMENT FOR Q4 FIRS',
      aliasInfo: hisGraceAliases,
      preferredContactType: 'unknown',
      countryCode: 'NG',
      transactionAmount: 250000,
    });

    expect(result.reason).toBe('tax');
    expect(result.contactName).toContain('TAX PAYMENT');
    expect(result.fingerprintSeed).toContain('tax_payment');
  });

  it('treats small VAT fees without keywords as tax payments in US', () => {
    const result = resolveDescriptionHeuristics({
      companyId: 'company-6',
      description: 'VAT ADJUSTMENT',
      aliasInfo: logistocksAliases,
      preferredContactType: 'unknown',
      countryCode: 'US',
      transactionAmount: 300,
    });

    expect(result.reason).toBe('tax');
    expect(result.contactName).toContain('TAX PAYMENT');
  });
});
