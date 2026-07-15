import crypto from 'crypto';
import type { Knex } from 'knex';

import { ENV } from '../../config/env.js';
import { knexClient } from '../../db/knexClient.js';

/** Spaces/dashes/dots/underscores only — leading zeros are semantic. */
const PRESENTATION_SEPARATORS = /[\s\-._]/g;

export const ACCOUNT_NUMBER_FINGERPRINT_VERSION = Number(
  ENV.ACCOUNT_NUMBER_FINGERPRINT_VERSION || '1',
);

export function normalizeAccountNumber(raw: string): string {
  return raw.normalize('NFKC').replace(PRESENTATION_SEPARATORS, '');
}

export function maskAccountNumber(normalized: string): string {
  if (normalized.length <= 4) return normalized;
  return normalized.slice(-4);
}

function getHmacKey(): Buffer {
  const key = ENV.ACCOUNT_NUMBER_HMAC_KEY;
  if (!key || key.length < 32) {
    throw new Error(
      'ACCOUNT_NUMBER_HMAC_KEY must be set (min 32 chars) for account identity',
    );
  }
  return Buffer.from(key, 'utf8');
}

/** Blind index; rotating the key requires a deliberate identity migration. */
export function fingerprintAccountNumber(
  normalized: string,
  version: number = ACCOUNT_NUMBER_FINGERPRINT_VERSION,
): string {
  const payload = `v${version}:${normalized}`;
  return crypto
    .createHmac('sha256', getHmacKey())
    .update(payload, 'utf8')
    .digest('hex');
}

export type AccountNumberIdentity = {
  account_number_mask: string;
  account_number_fingerprint: string;
  account_number_fingerprint_version: number;
};

export function deriveAccountNumberIdentity(
  rawAccountNumber: string,
): AccountNumberIdentity {
  const normalized = normalizeAccountNumber(rawAccountNumber);
  if (!normalized) {
    throw new Error('Account number is empty after normalization');
  }
  const version = ACCOUNT_NUMBER_FINGERPRINT_VERSION;
  return {
    account_number_mask: maskAccountNumber(normalized),
    account_number_fingerprint: fingerprintAccountNumber(normalized, version),
    account_number_fingerprint_version: version,
  };
}

/** Fingerprint-only; mask is display data and collides across accounts. */
export async function findAccountByFingerprint({
  companyId,
  bankId,
  fingerprint,
  forUpdate = false,
  trx,
}: {
  companyId: string;
  bankId: string;
  fingerprint: string;
  forUpdate?: boolean;
  trx?: Knex | Knex.Transaction;
}): Promise<{ id: string; coa_id: string } | null> {
  const knex = trx ?? knexClient;
  let query = knex('bank_accounts').where({
    company_id: companyId,
    bank_id: bankId,
    account_number_fingerprint: fingerprint,
    is_deleted: false,
  });
  if (forUpdate) {
    query = query.forUpdate();
  }

  const row = await query.first<{ id: string; coa_id: string }>([
    'id',
    'coa_id',
  ]);
  return row ?? null;
}
