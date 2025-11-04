import type { Knex } from 'knex';
import type { ContactType } from '../../contacts/index.js';
import {
  mccReferenceFileSchema,
  merchantPatternsFileSchema,
  type CompiledMerchantPattern,
  type ContactMatchConfidence,
  type ContactResolutionResult,
  type EnrichmentContactType,
  type MccReference,
  type MccReferenceFile,
  type MerchantPattern,
  type MerchantPatternsFile,
} from './enrichment.types.js';
import { extractContactFromDescription } from './utils/contact-from-desc.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';
import { generateFingerprintSync, logger } from '../../../shared/index.js';
import { extractMccFromDescription } from './utils/mcc-from-desc.js';
import { knexClient } from '../../../db/knexClient.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const merchantPatternsPath = join(__dirname, '../data/merchant-patterns.json');
const mccReferencePath = join(__dirname, '../data/mcc-reference.json');

let merchantPatternsFile: MerchantPatternsFile | null = null;
let mccReferenceFile: MccReferenceFile | null = null;

let merchantPatterns: CompiledMerchantPattern[] = [];
let mccReference: MccReference[] = [];
const mccByCode = new Map<string, MccReference>();

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
  companyUUID,
  contactId,
  contactTypeSnapshot,
  payee,
  description,
  trx,
}: {
  companyUUID: string;
  contactId: string | null;
  contactTypeSnapshot?: ContactType | null;
  payee: string | null;
  description: string;
  trx?: Knex.Transaction;
}): Promise<ContactResolutionResult> {
  const exec = async (tx: Knex.Transaction) => {
    let contactName: string | null = null;
    let confidence: ContactMatchConfidence = 'unmatched';

    // If contact id is provided, get the contact from db
    if (contactId || payee) {
      const existingContact = await tx('contacts')
        .select('id', 'normalized_name')
        .where({
          company_id: companyUUID,
          is_deleted: false,
        })
        .where((b) => {
          b.where('id', contactId).orWhere('display_name', payee);
        })
        .first();

      if (existingContact) {
        contactName = existingContact.normalized_name;
        confidence = 'high';
      }
    }

    // If contact id is not provided or contact is not found, get the contact from heuristics
    if (!contactName) {
      const heuristicName = extractContactFromDescription(description);
      if (heuristicName) {
        contactName = heuristicName;
        confidence = 'low';
      }
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
    const global_contact_category_hints = [
      ...(mccMatch?.obj.category_hints ?? []),
      ...(merchantMatch?.merchant.category_hints ?? []),
    ];

    const contact_fingerprint = contactName
      ? generateFingerprintSync(contactName.toLowerCase().trim())
      : null;

    const contact_type: EnrichmentContactType =
      contactTypeSnapshot ?? 'unknown';
    return {
      contact_id: contactId,
      contact_name: contactName,
      contact_fingerprint,
      contact_match_confidence: confidence,
      global_contact_name,
      global_contact_category_hints,
      contact_type,
      mcc: mccMatch?.code,
    };
  };

  if (trx) {
    return await exec(trx);
  } else {
    return await knexClient.transaction(exec);
  }
}

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
