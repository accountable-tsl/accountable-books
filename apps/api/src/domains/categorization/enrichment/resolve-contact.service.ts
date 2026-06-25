import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { Knex } from 'knex';

import { knexClient } from '../../../db/knexClient.js';
import { generateFingerprintSync, logger } from '../../../shared/index.js';
import { normalizeContactName } from '../../contacts/contact-normalization.utils.js';
import { chooseContactMatch } from '../../contacts/contact-resolution-selection.utils.js';
import {
  mccReferenceFileSchema,
  merchantPatternsFileSchema,
} from './enrichment.types.js';
import {
  buildAliasMatcher,
  extendAliasMatcher,
  resolveDescriptionHeuristics,
} from './resolve-contact-heuristics.js';
import { extractMccFromDescription } from './utils/mcc-from-desc.js';

import type { ContactType } from '../../contacts/index.js';
import type {
  CompiledMerchantPattern,
  ContactMatchConfidence,
  ContactResolutionResult,
  EnrichmentContactType,
  MccReference,
  MccReferenceFile,
  MerchantPattern,
  MerchantPatternsFile,
} from './enrichment.types.js';
import type { AliasMatcher } from './resolve-contact-heuristics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const merchantPatternsPath = join(__dirname, '../data/merchant-patterns.json');
const mccReferencePath = join(__dirname, '../data/mcc-reference.json');

let merchantPatternsFile: MerchantPatternsFile | null = null;
let mccReferenceFile: MccReferenceFile | null = null;

let merchantPatterns: CompiledMerchantPattern[] = [];
let mccReference: MccReference[] = [];
const mccByCode = new Map<string, MccReference>();

const aliasCache = new Map<string, AliasMatcher>();

const loadMerchants = async () => {
  try {
    // Read files
    const patternsData = readFileSync(merchantPatternsPath, 'utf-8');
    const mccData = readFileSync(mccReferencePath, 'utf-8');

    // Validate the structure
    merchantPatternsFile = merchantPatternsFileSchema.parse(
      JSON.parse(patternsData),
    );
    mccReferenceFile = mccReferenceFileSchema.parse(JSON.parse(mccData));

    // Compiles array of merchant patterns into regex array per merchant, skipping invalid regex or empty ones.
    const rawPatterns = merchantPatternsFile.patterns || [];
    merchantPatterns = compileMerchantPatterns(rawPatterns);

    logger.info({ count: merchantPatterns.length }, 'Loaded merchant patterns');

    mccReference = mccReferenceFile.mccs;
    mccByCode.clear();
    for (const entry of mccReference) {
      mccByCode.set(entry.mcc, entry);
    }

    logger.info({ count: mccReference.length }, 'Loaded mcc reference');
  } catch (error) {
    logger.warn(
      { error },
      'Failed to load merchant patterns - continuing without',
    );
  }
};

await loadMerchants();

export async function resolveContactForEnrichment({
  company,
  bankAccount,
  contactId,
  contactTypeSnapshot,
  payee,
  description,
  transactionAmount,
  trx,
}: {
  company: {
    uuid: string;
    displayName: string;
    legalName?: string;
    countryCode?: string | null;
  };
  bankAccount: {
    accountName?: string;
    displayName?: string;
    aliases?: string[];
  } | null;
  contactId: string | null;
  contactTypeSnapshot?: ContactType | null;
  payee: string | null;
  description: string;
  transactionAmount?: number | null;
  trx?: Knex.Transaction;
}): Promise<ContactResolutionResult> {
  const companyUUID = company.uuid;

  const exec = async (tx: Knex.Transaction) => {
    let resolvedContactId: string | null = null;
    let contactName: string | null = null;
    let confidence: ContactMatchConfidence = 'unmatched';
    let contactType: EnrichmentContactType = contactTypeSnapshot ?? 'unknown';
    let fingerprintSeed: string | null = null;

    // Explicit resolution wins. Do not combine this with payee matching, because
    // an OR query can return a different contact than the resolved ID.
    if (contactId) {
      const existingContact = await tx('contacts')
        .select('id', 'normalized_name')
        .where({
          id: contactId,
          company_id: companyUUID,
          status: 'active',
          is_deleted: false,
        })
        .first();

      if (existingContact) {
        resolvedContactId = existingContact.id;
        contactName = existingContact.normalized_name;
        confidence = 'high';
        fingerprintSeed = existingContact.normalized_name.toLowerCase();
      }
    }

    // Then try exact company-scoped aliases or one unambiguous normalized-name
    // match. Duplicate contact names are valid, so multiple matches are treated
    // as ambiguous and left for heuristics/unmatched handling.
    if (!contactName && !contactId && payee) {
      const normalizedPayee = normalizeContactName(payee);

      // const aliasContacts = await tx('contact_aliases as ca')
      //   .join('contacts as c', function joinContacts() {
      //     this.on('c.id', '=', 'ca.contact_id').andOn(
      //       'c.company_id',
      //       '=',
      //       'ca.company_id',
      //     );
      //   })
      //   .where({
      //     'ca.company_id': companyUUID,
      //     'ca.normalized_alias': normalizedPayee,
      //     'ca.is_deleted': false,
      //     'c.status': 'active',
      //     'c.is_deleted': false,
      //   })
      //   .whereNot('ca.verification_status', 'rejected')
      //   .select('ca.id as alias_id', 'c.id', 'c.normalized_name');

      const aliasContacts: Array<{
        alias_id: string;
        id: string;
        normalized_name: string;
      }> = [];

      const contactMatches = await tx('contacts')
        .where({
          company_id: companyUUID,
          normalized_name: normalizedPayee,
          status: 'active',
          is_deleted: false,
        })
        .select('id', 'normalized_name');
      const selection = chooseContactMatch({
        aliases: aliasContacts.map((contact) => ({
          id: contact.alias_id,
          contact_id: contact.id,
        })),
        contacts: contactMatches,
      });

      if (selection?.contactId) {
        const candidateId = selection.contactId;
        const aliasContact = aliasContacts.find(
          (contact) => contact.id === candidateId,
        );
        const match =
          aliasContact ??
          contactMatches.find((contact) => contact.id === candidateId);
        if (match) {
          resolvedContactId = match.id;
          contactName = match.normalized_name;
          confidence = aliasContact ? 'high' : 'medium';
          fingerprintSeed = match.normalized_name.toLowerCase();
        }
      }
    }

    // If contact id is not provided or contact is not found, get the contact
    // classification from heuristics. Heuristics may produce a contact-like
    // name/fingerprint, but they do not assign a canonical contact ID.
    if (!contactName) {
      // Get company alias matcher
      const bankAccountAliases = bankAccount?.aliases;
      const aliasInfo = getCompanyAliasMatcher(company, bankAccount);

      const enrichedAliasInfo =
        bankAccountAliases && bankAccountAliases.length > 0
          ? extendAliasMatcher(aliasInfo, bankAccountAliases)
          : aliasInfo;
      const heuristic = resolveDescriptionHeuristics({
        companyId: companyUUID,
        description,
        aliasInfo: enrichedAliasInfo,
        preferredContactType: contactType,
        countryCode: company?.countryCode,
        transactionAmount,
      });

      contactName = heuristic.contactName;
      contactType = heuristic.contactType;
      confidence = heuristic.confidence;
      fingerprintSeed =
        heuristic.fingerprintSeed ??
        heuristic.contactName?.toLowerCase() ??
        null;
    }

    // Regardless of state, attempt to search for any fuzzy matches in the global merchant or MCC registry
    // We use the contact name and description as search terms for merchant patterns; description for MCC
    const mccMatch = extractMccFromDescription(description, mccByCode);
    const merchantMatch = matchGlobalMerchant(
      (contactName ?? '') + description,
      merchantPatterns,
    );

    const global_contact_name =
      merchantMatch?.merchant.name ?? mccMatch?.obj.title ?? null;
    const global_category_hints = Array.from(
      new Set([
        ...(mccMatch?.obj.category_hints ?? []),
        ...(merchantMatch?.merchant.category_hints ?? []),
      ]),
    );

    const fingerprintSource =
      fingerprintSeed ?? contactName?.toLowerCase()?.trim();

    const fallbackSeed =
      fingerprintSource && fingerprintSource.length > 0
        ? fingerprintSource
        : payee
          ? payee
          : description.trim().length > 0
            ? description.toLowerCase().trim()
            : `${companyUUID}:unknown-contact`;
    const contact_fingerprint = generateFingerprintSync(fallbackSeed);

    return {
      contact_id: resolvedContactId,
      contact_name: contactName,
      contact_fingerprint,
      contact_match_confidence: confidence,
      global_contact_name,
      global_contact_category_hints:
        global_category_hints.length > 0 ? global_category_hints : null,
      contact_type: contactType,
      mcc: mccMatch?.code ?? null,
    };
  };

  if (trx) {
    return await exec(trx);
  } else {
    return await knexClient.transaction(exec);
  }
}

type ResolveContactParams = Parameters<typeof resolveContactForEnrichment>[0];

export function matchGlobalMerchant(
  description: string,
  merchantPatterns: CompiledMerchantPattern[],
): CompiledMerchantPattern | null {
  if (!description) {
    return null;
  }

  for (const pattern of merchantPatterns) {
    for (const regex of pattern.regexes) {
      if (regex.test(description)) {
        return pattern;
      }
    }
  }

  return null;
}

function compileMerchantPatterns(
  patterns: MerchantPattern[],
): CompiledMerchantPattern[] {
  const compiled: CompiledMerchantPattern[] = [];

  for (const merchant of patterns) {
    const regexes: RegExp[] = [];

    for (const expression of merchant.patterns) {
      try {
        regexes.push(new RegExp(expression, 'i'));
      } catch (error) {
        logger.warn(
          { expression, merchant: merchant.name, error },
          'Failed to compile merchant pattern expression',
        );
      }
    }

    if (regexes.length === 0) {
      logger.warn(
        { merchant: merchant.name },
        'Skipping merchant pattern without valid expressions',
      );
      continue;
    }

    compiled.push({ merchant, regexes });
  }

  return compiled;
}

function getCompanyAliasMatcher(
  company: ResolveContactParams['company'],
  bankAccount: ResolveContactParams['bankAccount'],
): AliasMatcher {
  const cached = aliasCache.get(company.uuid);
  if (cached) {
    const extended = extendAliasMatcher(cached, [
      bankAccount?.displayName,
      bankAccount?.accountName,
    ]);
    aliasCache.set(company.uuid, extended);
    return extended;
  }

  const aliasValues = [
    company?.displayName,
    company?.legalName,
    bankAccount?.displayName,
    bankAccount?.accountName,
  ].filter((value): value is string => Boolean(value));

  const matcher = buildAliasMatcher({
    aliases: aliasValues,
    primaryDisplayName: company?.displayName ?? company?.legalName ?? null,
  });

  aliasCache.set(company.uuid, matcher);
  return matcher;
}
