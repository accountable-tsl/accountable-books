import type { Knex } from 'knex';

export type BillingAccountProfileRow = {
  id: string;
  billing_account_id: string;
  legal_entity_name: string;
  billing_email: string;
  billing_country_code: string;
  tax_id: string | null;
  tax_id_type: string | null;
  tax_exemption_code: string | null;
  address_json: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
};

export type UpsertBillingAccountProfileInput = {
  billingAccountId: string;
  legalEntityName: string;
  billingEmail: string;
  billingCountryCode: string;
  taxId?: string | null;
  taxIdType?: string | null;
  taxExemptionCode?: string | null;
  addressJson?: Record<string, unknown> | null;
};

const PROFILE_COLUMNS = [
  'id',
  'billing_account_id',
  'legal_entity_name',
  'billing_email',
  'billing_country_code',
  'tax_id',
  'tax_id_type',
  'tax_exemption_code',
  'address_json',
  'created_at',
  'updated_at',
] as const;

function assertValidProfileInput(
  input: UpsertBillingAccountProfileInput,
): void {
  const legalEntityName = input.legalEntityName?.trim();
  if (!legalEntityName) {
    throw new Error('legalEntityName is required');
  }

  const billingEmail = input.billingEmail?.trim();
  if (!billingEmail || !billingEmail.includes('@')) {
    throw new Error('billingEmail must be a valid email address');
  }

  const countryCode = input.billingCountryCode?.trim().toUpperCase();
  if (!countryCode || !/^[A-Z]{2}$/.test(countryCode)) {
    throw new Error('billingCountryCode must be a 2-letter country code');
  }

  if (
    input.addressJson !== undefined &&
    input.addressJson !== null &&
    (typeof input.addressJson !== 'object' || Array.isArray(input.addressJson))
  ) {
    throw new Error('addressJson must be a plain object when provided');
  }
}

function toProfileRow(
  input: UpsertBillingAccountProfileInput,
): Omit<BillingAccountProfileRow, 'id' | 'created_at' | 'updated_at'> {
  return {
    billing_account_id: input.billingAccountId,
    legal_entity_name: input.legalEntityName.trim(),
    billing_email: input.billingEmail.trim(),
    billing_country_code: input.billingCountryCode.trim().toUpperCase(),
    tax_id: input.taxId ?? null,
    tax_id_type: input.taxIdType ?? null,
    tax_exemption_code: input.taxExemptionCode ?? null,
    address_json: input.addressJson ?? null,
  };
}

export async function upsertBillingAccountProfile(
  input: UpsertBillingAccountProfileInput,
  db: Knex | Knex.Transaction,
): Promise<BillingAccountProfileRow> {
  assertValidProfileInput(input);

  const row = toProfileRow(input);

  const [saved] = await db('billing_account_profiles')
    .insert(row)
    .onConflict('billing_account_id')
    .merge({
      legal_entity_name: row.legal_entity_name,
      billing_email: row.billing_email,
      billing_country_code: row.billing_country_code,
      tax_id: row.tax_id,
      tax_id_type: row.tax_id_type,
      tax_exemption_code: row.tax_exemption_code,
      address_json: row.address_json,
      updated_at: db.fn.now(),
    })
    .returning(PROFILE_COLUMNS);

  if (!saved) {
    throw new Error('Failed to upsert billing account profile');
  }

  return saved as BillingAccountProfileRow;
}

export async function getBillingAccountProfile(
  billingAccountId: string,
  db: Knex | Knex.Transaction,
): Promise<BillingAccountProfileRow | null> {
  const row = await db('billing_account_profiles')
    .select(PROFILE_COLUMNS)
    .where({ billing_account_id: billingAccountId })
    .first();

  return (row as BillingAccountProfileRow | undefined) ?? null;
}
