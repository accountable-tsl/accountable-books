import { z } from 'zod';

import { createAuditWriter } from '../audit/index.js';
import { roleKey } from '../roles/roles.types.js';

const accountingFirmMetaPayload = z.object({
  slug: z.string(),
  firmType: z.string().nullable(),
  operation: z.enum(['created', 'updated']),
});

const firmAssignmentPayload = z.object({
  assignedFirmId: z.uuid(),
  operation: z.enum(['created', 'updated']),
});

const workspaceRoleGrantPayload = z.object({
  userId: z.uuid(),
  roleKey,
  operation: z.enum(['created', 'updated']),
});

export const writeAccountingFirmMetaProvisioningAudit = createAuditWriter({
  entityType: 'company',
  action: 'company.accounting_firm_meta_provisioned',
  schemaVersion: '1',
  payloadSchema: accountingFirmMetaPayload,
});

export const writeFirmAssignmentProvisioningAudit = createAuditWriter({
  entityType: 'company',
  action: 'company.firm_assignment_provisioned',
  schemaVersion: '1',
  payloadSchema: firmAssignmentPayload,
});

export const writeWorkspaceRoleGrantProvisioningAudit = createAuditWriter({
  entityType: 'company',
  action: 'company.workspace_role_granted',
  schemaVersion: '1',
  payloadSchema: workspaceRoleGrantPayload,
});
