import type { Knex } from 'knex';

import { knexClient } from '../../db/knexClient.js';
import { getIdentifierType } from '../../shared/utils/formatting.utils.js';
import { AppError, ErrorCode } from '../../shared/utils/response.utils.js';

export function companyNullableStringsEqual(a: unknown, b: unknown): boolean {
  const norm = (v: unknown): string | null => {
    if (v === undefined || v === null) return null;
    const t = String(v).trim();
    return t.length === 0 ? null : t;
  };
  return norm(a) === norm(b);
}

type CompanyIdentifierResult = {
  id: string;
  short_code: string;
};

export const getCompanyIdentifiers = async (
  identifier: string,
  trx?: Knex.Transaction | Knex,
): Promise<CompanyIdentifierResult> => {
  const trimmedId = identifier.trim();
  if (!trimmedId || trimmedId.length > 50)
    throw new AppError(
      'Invalid company identifier',
      undefined,
      false,
      ErrorCode.INVALID_INPUT,
    );

  const knex = trx || knexClient;

  const idType = getIdentifierType(trimmedId);

  const company = await knex('companies')
    .select('id', 'short_code')
    .where(idType === 'uuid' ? { id: trimmedId } : { short_code: trimmedId })
    .timeout(1000)
    .first();

  if (!company)
    throw new AppError(
      'Company not found',
      undefined,
      false,
      ErrorCode.NOT_FOUND,
    );

  return { id: company.id, short_code: company.short_code };
};
