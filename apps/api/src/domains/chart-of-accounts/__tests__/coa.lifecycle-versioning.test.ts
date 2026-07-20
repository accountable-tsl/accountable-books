import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDb } from '../../../../config/test-db.js';
import {
  getTestCompanyId,
  getTestUserId,
  US_USER_EMAIL,
} from '../../../../test/helpers.js';
import { generateChecksum } from '../../../shared/index.js';
import {
  archiveCoa,
  createCoaAccount,
  deleteCoa,
  editCoa,
  unarchiveCoa,
} from '../coa.model.js';

type VersionRow = {
  version_seq: number;
  effective_to: Date | null;
  changeset: Record<string, { from: unknown; to: unknown }> | null;
  name: string;
  is_active: boolean;
  is_deleted: boolean;
};

describe('COA lifecycle versioning', () => {
  let trx: Knex.Transaction;
  let companyId: string;
  let userId: string;

  beforeEach(async () => {
    trx = await getTestDb().transaction();
    companyId = await getTestCompanyId(trx, 'bizDemoUS');
    userId = await getTestUserId(trx, US_USER_EMAIL);
  });

  afterEach(async () => {
    await trx.rollback();
  });

  it('versions edit, archive, unarchive, and soft-delete lifecycle changes', async () => {
    const originalName = `Lifecycle ${randomUUID()}`;
    const editedName = `Edited ${randomUUID()}`;
    const { id } = await createCoaAccount({
      trx,
      companyId,
      userId,
      input: {
        name: originalName,
        account_type_key: 'ca_other',
      },
    });
    const initialSnapshot = await getSnapshotVersion(trx, companyId);

    const edited = await editCoa({
      trx,
      companyId,
      userId,
      updates: [{ id, name: editedName }],
    });
    expect(edited.success).toBe(true);
    await expectVersionState(trx, id, {
      sequence: 2,
      current: {
        name: editedName,
        changeset: { name: { from: originalName, to: editedName } },
      },
    });
    expect(await getSnapshotVersion(trx, companyId)).toBe(initialSnapshot + 1n);

    const archived = await archiveCoa({
      trx,
      companyId,
      userId,
      accountIds: [id],
    });
    expect(archived.success).toBe(true);
    await expectVersionState(trx, id, {
      sequence: 3,
      current: {
        is_active: false,
        changeset: { is_active: { from: true, to: false } },
      },
    });
    expect(await getSnapshotVersion(trx, companyId)).toBe(initialSnapshot + 2n);

    const unarchived = await unarchiveCoa({
      trx,
      companyId,
      userId,
      accountIds: [id],
    });
    expect(unarchived.success).toBe(true);
    await expectVersionState(trx, id, {
      sequence: 4,
      current: {
        is_active: true,
        changeset: { is_active: { from: false, to: true } },
      },
    });
    expect(await getSnapshotVersion(trx, companyId)).toBe(initialSnapshot + 3n);

    const deleted = await deleteCoa({
      trx,
      companyId,
      userId,
      accountIds: [id],
    });
    expect(deleted.success).toBe(true);
    await expectVersionState(trx, id, {
      sequence: 5,
      current: {
        is_active: false,
        is_deleted: true,
        changeset: {
          is_active: { from: true, to: false },
          is_deleted: { from: false, to: true },
        },
      },
    });
    expect(await getSnapshotVersion(trx, companyId)).toBe(initialSnapshot + 4n);

    const persisted = await trx('coa').where({ id }).first<{
      is_active: boolean;
      is_deleted: boolean;
      deleted_at: Date | null;
      version_seq: number;
    }>('is_active', 'is_deleted', 'deleted_at', 'version_seq');
    expect(persisted).toMatchObject({
      is_active: false,
      is_deleted: true,
      version_seq: 5,
    });
    expect(persisted?.deleted_at).toBeInstanceOf(Date);
  });

  it('builds snapshot checksums from every current company COA version', async () => {
    const beforeCurrentIds = await getCurrentVersionIds(trx, companyId);
    const first = await createCoaAccount({
      trx,
      companyId,
      userId,
      input: {
        name: `Checksum first ${randomUUID()}`,
        account_type_key: 'ca_other',
      },
    });
    const firstSnapshot = await getSnapshot(trx, companyId);
    const firstCurrentIds = await getCurrentVersionIds(trx, companyId);

    expect(firstCurrentIds).toHaveLength(beforeCurrentIds.length + 1);
    expect(firstSnapshot.checksum).toBe(
      await generateChecksum(firstCurrentIds, { sortArrays: true }),
    );

    await createCoaAccount({
      trx,
      companyId,
      userId,
      input: {
        name: `Checksum second ${randomUUID()}`,
        account_type_key: 'ca_other',
      },
    });
    const secondSnapshot = await getSnapshot(trx, companyId);
    const secondCurrentIds = await getCurrentVersionIds(trx, companyId);

    expect(secondCurrentIds).toHaveLength(firstCurrentIds.length + 1);
    expect(secondSnapshot.checksum).toBe(
      await generateChecksum(secondCurrentIds, { sortArrays: true }),
    );
    expect(secondSnapshot.checksum).not.toBe(firstSnapshot.checksum);

    await editCoa({
      trx,
      companyId,
      userId,
      updates: [{ id: first.id, description: 'Checksum-changing edit' }],
    });
    const editedSnapshot = await getSnapshot(trx, companyId);
    const editedCurrentIds = await getCurrentVersionIds(trx, companyId);

    expect(editedCurrentIds).toHaveLength(secondCurrentIds.length);
    expect(editedSnapshot.checksum).toBe(
      await generateChecksum(editedCurrentIds, { sortArrays: true }),
    );
    expect(editedSnapshot.checksum).not.toBe(secondSnapshot.checksum);
  });

  it('does not create versions or snapshots for no-op changes', async () => {
    const name = `No-op ${randomUUID()}`;
    const { id } = await createCoaAccount({
      trx,
      companyId,
      userId,
      input: {
        name,
        account_type_key: 'ca_other',
      },
    });
    const snapshotBefore = await getSnapshot(trx, companyId);

    const editResult = await editCoa({
      trx,
      companyId,
      userId,
      updates: [{ id, name }],
    });
    const unarchiveResult = await unarchiveCoa({
      trx,
      companyId,
      userId,
      accountIds: [id],
    });

    expect(editResult.success).toBe(true);
    expect(editResult.data?.updatedAccounts).toEqual([]);
    expect(unarchiveResult.success).toBe(true);
    expect(unarchiveResult.data?.updatedAccounts).toEqual([]);
    expect(await getSnapshot(trx, companyId)).toEqual(snapshotBefore);

    const versions = await trx('coa_versions')
      .where({ coa_id: id })
      .select('id');
    expect(versions).toHaveLength(1);
  });

  it('versions account-type changes resolved from canonical keys', async () => {
    const { id } = await createCoaAccount({
      trx,
      companyId,
      userId,
      input: {
        name: `Type change ${randomUUID()}`,
        account_type_key: 'ca_other',
      },
    });
    const accountTypes = await trx('account_types')
      .whereIn('key', ['ca_other', 'ca_other_receivable'])
      .select<{ id: string; key: string }[]>('id', 'key');
    const accountTypeIds = new Map(
      accountTypes.map((accountType) => [accountType.key, accountType.id]),
    );

    const result = await editCoa({
      trx,
      companyId,
      userId,
      updates: [{ id, accountTypeKey: 'ca_other_receivable' }],
    });

    expect(result.success).toBe(true);
    await expectVersionState(trx, id, {
      sequence: 2,
      current: {
        changeset: {
          account_type_id: {
            from: accountTypeIds.get('ca_other'),
            to: accountTypeIds.get('ca_other_receivable'),
          },
        },
      },
    });
    const persisted = await trx('coa')
      .where({ id })
      .first<{ account_type_id: string }>('account_type_id');
    expect(persisted?.account_type_id).toBe(
      accountTypeIds.get('ca_other_receivable'),
    );
  });
});

async function expectVersionState(
  trx: Knex.Transaction,
  coaId: string,
  expected: {
    sequence: number;
    current: Partial<VersionRow>;
  },
): Promise<void> {
  const versions = await trx('coa_versions')
    .where({ coa_id: coaId })
    .orderBy('version_seq')
    .select<
      VersionRow[]
    >('version_seq', 'effective_to', 'changeset', 'name', 'is_active', 'is_deleted');

  expect(versions).toHaveLength(expected.sequence);
  expect(versions.slice(0, -1).every((version) => version.effective_to)).toBe(
    true,
  );
  expect(versions.at(-1)).toMatchObject({
    version_seq: expected.sequence,
    effective_to: null,
    ...expected.current,
  });
}

async function getSnapshotVersion(
  trx: Knex.Transaction,
  companyId: string,
): Promise<bigint> {
  return BigInt((await getSnapshot(trx, companyId)).snapshot_version);
}

async function getSnapshot(
  trx: Knex.Transaction,
  companyId: string,
): Promise<{ snapshot_version: string | number | bigint; checksum: string }> {
  const snapshot = await trx('coa_snapshot_versions')
    .where({ company_id: companyId })
    .first<{
      snapshot_version: string | number | bigint;
      checksum: string;
    }>('snapshot_version', 'checksum');

  if (!snapshot) {
    throw new Error('Expected company COA snapshot to exist');
  }
  return snapshot;
}

async function getCurrentVersionIds(
  trx: Knex.Transaction,
  companyId: string,
): Promise<string[]> {
  const versions = await trx('coa_versions')
    .where({ company_id: companyId })
    .whereNull('effective_to')
    .select<{ id: string }[]>('id');
  return versions.map((version) => version.id);
}
