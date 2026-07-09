import type { Knex } from 'knex';

/**
 * Phase 1 effective owner: the oldest active firm-user client assignment for
 * the client. Later assignment/reassignment flows can replace this rule in one
 * place.
 */
export async function resolveEffectiveOwnerUserId(
  client: Knex,
  clientCompanyId: string,
): Promise<string | null> {
  const row = await client('app.firm_user_client_assignments')
    .where({ client_company_id: clientCompanyId, is_deleted: false })
    .orderBy('created_at', 'asc')
    .first('firm_staff_user_id');

  return row?.firm_staff_user_id ?? null;
}

export async function loadEffectiveOwnerUserIds(
  client: Knex,
  clientCompanyIds: string[],
): Promise<Map<string, string>> {
  if (clientCompanyIds.length === 0) {
    return new Map();
  }

  const rows = await client('app.firm_user_client_assignments')
    .whereIn('client_company_id', clientCompanyIds)
    .andWhere('is_deleted', false)
    .orderBy('created_at', 'asc')
    .select('client_company_id', 'firm_staff_user_id');

  const owners = new Map<string, string>();
  for (const row of rows) {
    if (!owners.has(row.client_company_id)) {
      owners.set(row.client_company_id, row.firm_staff_user_id);
    }
  }
  return owners;
}

/**
 * Resolve the managing firm for a client workspace. Queue materialization,
 * activity, and later notifications must agree on this relationship.
 */
export async function resolveFirmCompanyId(
  client: Knex,
  clientCompanyId: string,
): Promise<string> {
  const assignment = await client('app.client_firm_assignments')
    .where({ client_company_id: clientCompanyId, is_deleted: false })
    .first('accounting_firm_company_id');

  if (assignment?.accounting_firm_company_id) {
    return assignment.accounting_firm_company_id;
  }

  const company = await client('app.companies')
    .where({ id: clientCompanyId })
    .first('id', 'type', 'workspace_class', 'assigned_firm_id');

  if (!company) {
    throw new Error(`Company ${clientCompanyId} not found`);
  }
  if (company.assigned_firm_id) {
    return company.assigned_firm_id;
  }
  if (company.type === 'accounting_firm') {
    return company.id;
  }
  if (company.workspace_class === 'customer') {
    // Standalone customer workspaces are self-managed; their "firm" projection
    // is deliberately the same company, rather than an accidental FK fallback.
    return company.id;
  }

  throw new Error(`Company ${clientCompanyId} has no managing firm assignment`);
}
