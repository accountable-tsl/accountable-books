import { z } from 'zod';

import { createAuditWriter } from '../audit/index.js';

const nullableUuid = z.uuid().nullable();

const contactCreatedPayload = z.object({
  displayName: z.string(),
  createdVia: z.string(),
  reviewStatus: z.string(),
});

const contactCreatedFromObservedCounterpartyPayload =
  contactCreatedPayload.extend({
    observedCounterpartyId: z.uuid(),
  });

const contactUpdatedPayload = z.object({
  changedFields: z.record(
    z.string(),
    z.object({
      previous: z.unknown().nullable(),
      next: z.unknown().nullable(),
    }),
  ),
});

const contactDeletedPayload = z.object({
  displayName: z.string().nullable(),
});

const contactResolutionChangedPayload = z.object({
  bankTransactionId: z.uuid(),
  previousContactId: nullableUuid,
  nextContactId: nullableUuid,
  previousContactType: z.string().nullable(),
  nextContactType: z.string().nullable(),
  previousStatus: z.string().nullable(),
  nextStatus: z.string(),
  source: z.string(),
  reason: z.string().nullable(),
});

const contactAliasChangedPayload = z.object({
  aliasId: z.uuid().nullable(),
  contactId: z.uuid(),
  alias: z.string(),
  previousContactId: nullableUuid.optional(),
  nextContactId: nullableUuid.optional(),
  replacementAliasId: nullableUuid.optional(),
  action: z.enum(['created', 'confirmed', 'rejected', 'reassigned', 'deleted']),
});

const contactReviewedPayload = z.object({
  previousReviewStatus: z.string(),
  nextReviewStatus: z.enum(['confirmed', 'rejected']),
  reason: z.string().nullable(),
});

const contactResolutionReviewedPayload = z.object({
  observedCounterpartyId: nullableUuid,
  contactId: nullableUuid,
  contactAliasId: nullableUuid,
  updatedResolutionCount: z.number().int().nonnegative(),
  reason: z.string().nullable(),
});

export const writeContactCreatedAudit = createAuditWriter({
  entityType: 'contact',
  action: 'contact.created',
  schemaVersion: '1',
  payloadSchema: contactCreatedPayload,
});

export const writeContactCreatedFromObservedCounterpartyAudit =
  createAuditWriter({
    entityType: 'contact',
    action: 'contact.created_from_observed_counterparty',
    schemaVersion: '1',
    payloadSchema: contactCreatedFromObservedCounterpartyPayload,
  });

export const writeContactUpdatedAudit = createAuditWriter({
  entityType: 'contact',
  action: 'contact.updated',
  schemaVersion: '1',
  payloadSchema: contactUpdatedPayload,
});

export const writeContactDeletedAudit = createAuditWriter({
  entityType: 'contact',
  action: 'contact.deleted',
  schemaVersion: '1',
  payloadSchema: contactDeletedPayload,
});

// export const writeContactResolutionChangedAudit = createAuditWriter({
//   entityType: 'bank_transaction_contact_resolution',
//   action: 'contact_resolution.changed',
//   schemaVersion: '1',
//   payloadSchema: contactResolutionChangedPayload,
// });

// export const writeContactConfirmedAudit = createAuditWriter({
//   entityType: 'contact',
//   action: 'contact.confirmed',
//   schemaVersion: '1',
//   payloadSchema: contactReviewedPayload,
// });

// export const writeContactRejectedAudit = createAuditWriter({
//   entityType: 'contact',
//   action: 'contact.rejected',
//   schemaVersion: '1',
//   payloadSchema: contactReviewedPayload,
// });

// export const writeContactAliasCreatedAudit = createAuditWriter({
//   entityType: 'contact_alias',
//   action: 'contact_alias.created',
//   schemaVersion: '1',
//   payloadSchema: contactAliasChangedPayload,
// });

// export const writeContactAliasConfirmedAudit = createAuditWriter({
//   entityType: 'contact_alias',
//   action: 'contact_alias.confirmed',
//   schemaVersion: '1',
//   payloadSchema: contactAliasChangedPayload,
// });

// export const writeContactAliasReassignedAudit = createAuditWriter({
//   entityType: 'contact_alias',
//   action: 'contact_alias.reassigned',
//   schemaVersion: '1',
//   payloadSchema: contactAliasChangedPayload,
// });

// export const writeContactAliasRejectedAudit = createAuditWriter({
//   entityType: 'contact_alias',
//   action: 'contact_alias.rejected',
//   schemaVersion: '1',
//   payloadSchema: contactAliasChangedPayload,
// });

// export const writeContactAliasDeletedAudit = createAuditWriter({
//   entityType: 'contact_alias',
//   action: 'contact_alias.deleted',
//   schemaVersion: '1',
//   payloadSchema: contactAliasChangedPayload,
// });

// export const writeContactResolutionConfirmedAudit = createAuditWriter({
//   entityType: 'bank_transaction_contact_resolution',
//   action: 'contact_resolution.confirmed',
//   schemaVersion: '1',
//   payloadSchema: contactResolutionReviewedPayload,
// });

// export const writeContactResolutionLinkedAudit = createAuditWriter({
//   entityType: 'bank_transaction_contact_resolution',
//   action: 'contact_resolution.linked',
//   schemaVersion: '1',
//   payloadSchema: contactResolutionReviewedPayload,
// });

// export const writeContactResolutionIgnoredAudit = createAuditWriter({
//   entityType: 'bank_transaction_contact_resolution',
//   action: 'contact_resolution.ignored',
//   schemaVersion: '1',
//   payloadSchema: contactResolutionReviewedPayload,
// });

// export const writeContactResolutionOverriddenAudit = createAuditWriter({
//   entityType: 'bank_transaction_contact_resolution',
//   action: 'contact_resolution.overridden',
//   schemaVersion: '1',
//   payloadSchema: contactResolutionReviewedPayload,
// });
