import { MOCK_FIRM_CLIENTS } from '../lib/mock-firm-clients';
import { MOCK_FIRM_COMPANY_ID } from '../lib/practice-fixture-ids';
import { firmClientRosterResponseSchema } from '../model/types';

import type { FirmClientRosterResponse } from '../model/types';

/**
 * Production: the roster is only companies that are **clients of the firm
 * context** (current firm / firm slug), not “every company in the user’s
 * session”. A bookkeeper can also be a client_owner elsewhere; those books
 * belong in the global company switcher, not mixed into this list.
 *
 * Demo: static mock rows exercise the UI until the API exists. Prefer demo
 * seeds that include a firm user with **zero** assigned clients to validate
 * empty states, rather than faking session ↔ roster alignment in the client.
 */

export function firmClientRosterQueryKey() {
  return ['firmClientRoster'] as const;
}

export async function fetchFirmClientRoster(): Promise<FirmClientRosterResponse> {
  return firmClientRosterResponseSchema.parse({
    firmCompanyId: MOCK_FIRM_COMPANY_ID,
    clients: MOCK_FIRM_CLIENTS,
  });
}
