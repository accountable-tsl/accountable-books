import type { Knex } from 'knex';
import axios from 'axios';

import { ENV } from '../config/env-loader.js';
import { adminUser } from './20250403184441_users.js';
import { countryMap } from './20250404021752_banks.js';
import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

interface MonoInstitution {
  id: string;
  institution: string;
  type: string;
  nip_code: string;
  bank_code: string;
  country: string;
  auth_methods: {
    _id: string;
    type: string;
    name: string;
    identifier: string;
  }[];
  scope: { name: string; type: string }[];
}
type MonoBankCoverage = {
  status: 'successful';
  message: string;
  timestamp: string;
  data: MonoInstitution[];
};
async function syncMonoInstitutionsToMappingsNG(
  systemUserId: string,
  knex: Knex,
) {
  const monoSecretKey = ENV.MONO_SECRET_KEY;
  if (!monoSecretKey) throw new Error('Mono secret key is required');
  console.log('Starting Mono institutions sync...');

  const { data } = await axios.get<MonoBankCoverage>(
    'https://api.withmono.com/v3/institutions',
    {
      headers: { Authorization: `Bearer ${ENV.MONO_SECRET_KEY}` },
      timeout: 10_000,
    },
  );
  if (!data || data.status !== 'successful' || !data.data) {
    return { msg: 'Invalid (or no) response from Mono API', data };
  }

  // Filter for Nigerian institutions with valid NIP codes
  const monoNG = data.data.filter(
    (i) => i.country?.toLowerCase() === 'ng' && i.id && i.institution,
  );
  if (monoNG.length === 0) {
    return {
      msg: 'No institutions to sync',
      created: 0,
      updated: 0,
      skipped: 0,
    };
  }

  // Pre-fetch required reference data
  const [provider, nigeria] = await Promise.all([
    knex('bank_feed_providers').where({ key: 'mono' }).first('id'),
    countryMap.get('NG') || knex('countries').where({ code: 'NG' }).first(),
  ]);

  if (!provider) throw new Error('Mono provider not found in database');
  if (!nigeria) throw new Error('Nigeria country record not found in database');

  // Pre-fetch all Nigerian banks and existing mappings for efficient lookup
  const [allBanks, existing] = await Promise.all([
    knex('banks')
      .where({ country_id: nigeria.id })
      .select('id', 'local_code', 'secondary_reference', 'key'),

    knex('bank_provider_mappings')
      .where({ provider_id: provider.id })
      .select(
        'bank_id',
        'provider_bank_id',
        'id',
        'provider_bank_name',
        'raw_provider_data',
      ),
  ]);

  // Create lookup maps
  interface BankRow {
    id: string;
    local_code: string | null;
    secondary_reference: string | null;
    key: string;
  }
  const banksByLocalCode = new Map<string, BankRow>();
  const banksBySecondaryRef = new Map<string, BankRow>();
  let otherFI: BankRow | null = null;

  for (const b of allBanks) {
    if (b.local_code) banksByLocalCode.set(b.local_code, b);
    if (b.secondary_reference)
      banksBySecondaryRef.set(b.secondary_reference, b);
    if (b.key === 'ng_other_financial_institution') otherFI = b;
  }
  if (!otherFI) throw new Error('Other financial institution bank not found');

  let created = 0,
    updated = 0;
  // Process institutions in batches
  const BATCH_SIZE = parseInt(ENV.MONO_SYNC_BATCH_SIZE ?? '50', 10) || 50;
  for (let i = 0; i < monoNG.length; i += BATCH_SIZE) {
    const batch = monoNG.slice(i, i + BATCH_SIZE);

    interface MappingRow {
      bank_id: string;
      provider_bank_id: string;
      provider_bank_name: string;
      raw_provider_data: Record<string, unknown>;
    }
    const processInTransaction = async (trx: Knex | Knex.Transaction) => {
      const toInsert: MappingRow[] = [];
      const toUpdate: MappingRow[] = [];

      for (const inst of batch) {
        // Simplified bank lookup
        const bank =
          banksByLocalCode.get(inst.nip_code) ||
          banksByLocalCode.get(inst.bank_code) ||
          banksBySecondaryRef.get(inst.nip_code) ||
          banksBySecondaryRef.get(inst.bank_code) ||
          otherFI;

        const existingMapping = existing.find(
          (m) => m.provider_bank_id === inst.id,
        );

        const mappingData = {
          bank_id: bank.id,
          provider_id: provider.id,
          provider_bank_id: inst.id,
          provider_alternate_id: inst.bank_code,
          provider_bank_secondary_reference: inst.nip_code,
          provider_bank_name: inst.institution,
          raw_provider_data: inst,
        };

        if (!existingMapping) {
          // New mapping
          toInsert.push({
            ...mappingData,
            created_by_id: systemUserId,
            updated_by_id: systemUserId,
          });
          created++;
        } else {
          // Always update existing records
          toUpdate.push({
            id: existingMapping.id,
            ...mappingData,
            updated_by_id: systemUserId,
          });
          updated++;
        }
      }

      // Bulk insert new mappings
      if (toInsert.length > 0) {
        await trx('bank_provider_mappings').insert(toInsert);
      }

      // Bulk update existing mappings
      for (const updateData of toUpdate) {
        const { id, ...updateFields } = updateData;
        await trx('bank_provider_mappings').where({ id }).update(updateFields);
      }
    };
    if (knex.isTransaction) {
      await processInTransaction(knex);
    } else {
      await knex.transaction(processInTransaction);
    }

    console.log(`Processed batch: ${batch.length} institutions`);
  }

  return {
    msg: `Synced Mono institutions: ${created} created, ${updated} updated, 0 skipped`,
    x: { created, updated, skipped: 0 },
  };
}

const tableName = 'bank_provider_mappings';
const seedBankProviderMappings = async (knex: Knex) => {
  const adminUserId = adminUser.id;
  if (!adminUserId) throw new Error('adminUserId is required');
  await syncMonoInstitutionsToMappingsNG(adminUserId, knex);
};
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));

    table
      .uuid('provider_id') // Bank Feed Provider ID
      .notNullable()
      .references('id')
      .inTable('bank_feed_providers')
      .onDelete('CASCADE');

    table
      .uuid('bank_id')
      .notNullable()
      .references('id')
      .inTable('banks')
      .onDelete('CASCADE');

    table
      .string('provider_bank_id')
      .notNullable()
      .comment("Provider's primary bank identifier");

    table.string('provider_alternate_id').nullable(); // Another ID or Bank Code from provider

    table
      .string('provider_bank_secondary_reference')
      .nullable()
      .comment('Fallback ID from provider'); // optional secondary ID

    table.string('provider_bank_name').nullable();
    table.jsonb('raw_provider_data').nullable();

    table
      .uuid('created_by_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');

    table
      .uuid('updated_by_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    addStandardColumns(knex, table);

    table.unique(['provider_id', 'provider_bank_id']);
    table.index(['provider_id', 'bank_id']);
    table.index(['bank_id']);
    table.index(['provider_id']);
  });
  await createUpdateTimestampTrigger(knex, tableName);

  await seedBankProviderMappings(knex);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
