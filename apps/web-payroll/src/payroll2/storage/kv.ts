import { idbDel, idbGet, idbSet } from './idb-kv';
import { localDel, localGet, localSet } from './local-kv';

type KvDriver = {
  get: (key: string) => Promise<unknown | undefined>;
  set: (key: string, value: unknown) => Promise<void>;
  del: (key: string) => Promise<void>;
};

function supportsIndexedDb() {
  return typeof indexedDB !== 'undefined';
}

async function createDriver(): Promise<KvDriver> {
  if (!supportsIndexedDb()) {
    return { get: localGet, set: localSet, del: localDel };
  }

  try {
    // Probe open/put/get quickly by using the real methods.
    const probeKey = '__probe__';
    await idbSet(probeKey, { ok: true });
    await idbGet(probeKey);
    await idbDel(probeKey);
    return { get: idbGet, set: idbSet, del: idbDel };
  } catch {
    return { get: localGet, set: localSet, del: localDel };
  }
}

let driverPromise: Promise<KvDriver> | null = null;
async function getDriver(): Promise<KvDriver> {
  driverPromise ??= createDriver();
  return await driverPromise;
}

export async function kvGet(key: string) {
  const driver = await getDriver();
  return await driver.get(key);
}

export async function kvSet(key: string, value: unknown) {
  const driver = await getDriver();
  return await driver.set(key, value);
}

export async function kvDel(key: string) {
  const driver = await getDriver();
  return await driver.del(key);
}

