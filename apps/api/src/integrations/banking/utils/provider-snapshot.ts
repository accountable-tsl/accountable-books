export type ProviderSnapshotKind =
  | 'institution'
  | 'connection'
  | 'account'
  | 'transaction';

const ALLOWED_KEYS: Record<ProviderSnapshotKind, ReadonlySet<string>> = {
  institution: new Set([
    'id',
    '_id',
    'institution_id',
    'name',
    'url',
    'logo',
    'primary_color',
    'country_codes',
    'products',
    'oauth',
    'status',
  ]),
  connection: new Set([
    'id',
    'item_id',
    'institution_id',
    'institution_name',
    'consent_expiration_time',
    'update_type',
  ]),
  account: new Set([
    'id',
    '_id',
    'account_id',
    'persistent_account_id',
    'name',
    'official_name',
    'mask',
    'type',
    'subtype',
    'currency',
    'iso_currency_code',
    'unofficial_currency_code',
    'balance',
    'balances',
    'institution',
  ]),
  transaction: new Set([
    'id',
    '_id',
    'transaction_id',
    'account_id',
    'amount',
    'date',
    'datetime',
    'authorized_date',
    'authorized_datetime',
    'name',
    'description',
    'merchant_name',
    'category',
    'category_id',
    'personal_finance_category',
    'pending',
    'pending_transaction_id',
    'payment_channel',
    'transaction_code',
    'iso_currency_code',
    'unofficial_currency_code',
    'location',
  ]),
};

const ALLOWED_NESTED_KEYS = new Set([
  'available',
  'current',
  'limit',
  'iso_currency_code',
  'unofficial_currency_code',
  'last_updated_datetime',
  'primary',
  'detailed',
  'confidence_level',
  'address',
  'city',
  'region',
  'postal_code',
  'country',
  'lat',
  'lon',
  'name',
  'type',
  'bank_code',
]);

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (value && typeof value === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(
      value as Record<string, unknown>,
    )) {
      if (ALLOWED_NESTED_KEYS.has(key)) {
        sanitized[key] = sanitizeValue(nestedValue);
      }
    }
    return sanitized;
  }
  return value;
}

/**
 * Persist only explicitly reviewed provider fields. Unknown fields are dropped,
 * so a provider cannot leak a newly introduced credential into a snapshot.
 */
export function sanitizeProviderSnapshot(
  value: Record<string, unknown> | null | undefined,
  kind: ProviderSnapshotKind,
): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;

  const sanitized: Record<string, unknown> = {};
  for (const [key, fieldValue] of Object.entries(value)) {
    if (ALLOWED_KEYS[kind].has(key)) {
      sanitized[key] = sanitizeValue(fieldValue);
    }
  }
  return sanitized;
}
