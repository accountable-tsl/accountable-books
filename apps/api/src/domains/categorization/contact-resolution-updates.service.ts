// import type { Knex } from 'knex';

// import { normalizeContactName } from '../contacts/contact-normalization.utils.js';
// import { ensureContactTypeAssignment } from '../contacts/contact-type-assignments.service.js';
// import {
//   writeContactAliasConfirmedAudit,
//   writeContactAliasCreatedAudit,
//   writeContactConfirmedAudit,
//   writeContactResolutionChangedAudit,
//   writeContactResolutionOverriddenAudit,
// } from '../contacts/contacts.audit.js';

// import type { ContactType } from '../contacts/index.js';

// type ResolutionSource = 'rule' | 'system' | 'user';
// type ResolutionStatus = 'inferred' | 'manual_override';

// export async function updateBankTransactionContactResolution({
//   trx,
//   companyId,
//   bankTransactionId,
//   contactId,
//   contactType,
//   source,
//   confidence,
//   reason,
//   resolvedById = null,
// }: {
//   trx: Knex.Transaction;
//   companyId: string;
//   bankTransactionId: string;
//   contactId: string | null | undefined;
//   contactType?: ContactType | null;
//   source: ResolutionSource;
//   confidence: number;
//   reason: string;
//   resolvedById?: string | null;
// }): Promise<void> {
//   if (!contactId) return;

//   const contact = await trx('contacts')
//     .where({
//       id: contactId,
//       company_id: companyId,
//       status: 'active',
//       is_deleted: false,
//     })
//     .select('id', 'review_status')
//     .first();

//   if (!contact) return;

//   await ensureContactTypeAssignment({
//     trx,
//     companyId,
//     contactId,
//     contactType,
//     userId: resolvedById,
//   });

//   let contactAliasId: string | null = null;
//   if (source === 'user' && resolvedById) {
//     await trx('contacts')
//       .where({
//         id: contactId,
//         company_id: companyId,
//         review_status: 'unreviewed',
//         is_deleted: false,
//       })
//       .update({
//         review_status: 'confirmed',
//         reviewed_by_id: resolvedById,
//         reviewed_at: trx.fn.now(),
//         updated_by_id: resolvedById,
//         updated_at: trx.fn.now(),
//       });

//     if (contact.review_status === 'unreviewed') {
//       await writeContactConfirmedAudit({
//         companyId,
//         entityId: contactId,
//         actor: { type: 'user', userId: resolvedById },
//         trx,
//         context: { source: 'web' },
//         payload: {
//           previousReviewStatus: 'unreviewed',
//           nextReviewStatus: 'confirmed',
//           reason,
//         },
//       });
//     }

//     contactAliasId = await createConfirmedAliasFromObservedCounterparty({
//       trx,
//       companyId,
//       bankTransactionId,
//       contactId,
//       userId: resolvedById,
//     });
//   }

//   const status: ResolutionStatus =
//     source === 'user' ? 'manual_override' : 'inferred';

//   const existing = await trx('bank_transaction_contact_resolutions')
//     .where({
//       bank_transaction_id: bankTransactionId,
//       company_id: companyId,
//     })
//     .select('contact_id', 'contact_type', 'status', 'confidence', 'source')
//     .first();

//   if (
//     existing &&
//     existing.status !== 'unresolved' &&
//     existing.status !== 'inferred' &&
//     source !== 'user'
//   ) {
//     return;
//   }

//   if (
//     existing?.status === 'inferred' &&
//     source !== 'rule' &&
//     Number(existing.confidence ?? 0) > confidence
//   ) {
//     return;
//   }

//   const row = {
//     bank_transaction_id: bankTransactionId,
//     company_id: companyId,
//     contact_id: contactId,
//     contact_alias_id: contactAliasId,
//     contact_type:
//       contactType !== undefined
//         ? contactType
//         : existing?.contact_id === contactId
//           ? (existing.contact_type ?? null)
//           : null,
//     status,
//     source,
//     confidence,
//     resolution_reason: reason,
//     resolved_at: trx.fn.now(),
//     resolved_by_id: resolvedById,
//     updated_at: trx.fn.now(),
//   };

//   await trx('bank_transaction_contact_resolutions')
//     .insert({
//       ...row,
//       created_at: trx.fn.now(),
//     })
//     .onConflict(['bank_transaction_id'])
//     .merge(row);

//   if (source === 'user' && resolvedById) {
//     await writeContactResolutionChangedAudit({
//       companyId,
//       entityId: bankTransactionId,
//       actor: { type: 'user', userId: resolvedById },
//       trx,
//       context: { source: 'web' },
//       payload: {
//         bankTransactionId,
//         previousContactId: existing?.contact_id ?? null,
//         nextContactId: contactId,
//         previousContactType: existing?.contact_type ?? null,
//         nextContactType: row.contact_type,
//         previousStatus: existing?.status ?? null,
//         nextStatus: status,
//         source,
//         reason,
//       },
//     });
//     await writeContactResolutionOverriddenAudit({
//       companyId,
//       entityId: bankTransactionId,
//       actor: { type: 'user', userId: resolvedById },
//       trx,
//       context: { source: 'web' },
//       payload: {
//         observedCounterpartyId: null,
//         contactId,
//         contactAliasId,
//         updatedResolutionCount: 1,
//         reason,
//       },
//     });
//   }
// }

// async function createConfirmedAliasFromObservedCounterparty({
//   trx,
//   companyId,
//   bankTransactionId,
//   contactId,
//   userId,
// }: {
//   trx: Knex.Transaction;
//   companyId: string;
//   bankTransactionId: string;
//   contactId: string;
//   userId: string | null;
// }): Promise<string | null> {
//   if (!userId) return null;

//   const observed = await trx('bank_transaction_contact_resolutions as bcr')
//     .join(
//       'observed_counterparties as oc',
//       'oc.id',
//       'bcr.observed_counterparty_id',
//     )
//     .where({
//       'bcr.company_id': companyId,
//       'bcr.bank_transaction_id': bankTransactionId,
//     })
//     .select('oc.id', 'oc.observed_name')
//     .first();

//   const alias = observed?.observed_name?.trim();
//   if (!alias) return null;

//   const normalizedAlias = normalizeContactName(alias);
//   if (!normalizedAlias) return null;

//   const [inserted] = await trx('contact_aliases')
//     .insert({
//       company_id: companyId,
//       contact_id: contactId,
//       observed_counterparty_id: observed.id,
//       alias,
//       normalized_alias: normalizedAlias,
//       source: 'user',
//       confidence: 1,
//       verification_status: 'user_confirmed',
//       verified_by_id: userId,
//       verified_at: trx.fn.now(),
//       is_primary: false,
//       created_by_id: userId,
//       updated_by_id: userId,
//     })
//     .onConflict(
//       trx.raw('(company_id, normalized_alias) WHERE is_deleted = false'),
//     )
//     .ignore()
//     .returning<{ id: string; contact_id: string }[]>(['id', 'contact_id']);

//   if (inserted) {
//     await writeContactAliasCreatedAudit({
//       companyId,
//       entityId: inserted.id,
//       actor: { type: 'user', userId },
//       trx,
//       context: { source: 'web' },
//       payload: {
//         aliasId: inserted.id,
//         contactId,
//         alias,
//         action: 'created',
//       },
//     });
//     return inserted.id;
//   }

//   const existing = await trx('contact_aliases')
//     .where({
//       company_id: companyId,
//       normalized_alias: normalizedAlias,
//       is_deleted: false,
//     })
//     .whereNot('verification_status', 'rejected')
//     .select('id', 'contact_id')
//     .first();

//   if (!existing) {
//     throw new Error('Alias could not be created');
//   }
//   if (existing.contact_id !== contactId) {
//     throw new Error('Active alias already belongs to another contact');
//   }

//   await trx('contact_aliases')
//     .where({ id: existing.id, company_id: companyId })
//     .update({
//       observed_counterparty_id: observed.id,
//       verification_status: 'user_confirmed',
//       verified_by_id: userId,
//       verified_at: trx.fn.now(),
//       confidence: 1,
//       updated_by_id: userId,
//       updated_at: trx.fn.now(),
//     });

//   await writeContactAliasConfirmedAudit({
//     companyId,
//     entityId: existing.id,
//     actor: { type: 'user', userId },
//     trx,
//     context: { source: 'web' },
//     payload: {
//       aliasId: existing.id,
//       contactId,
//       alias,
//       action: 'confirmed',
//     },
//   });

//   return existing.id;
// }
