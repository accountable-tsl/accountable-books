import { ENV } from './env.js';

function assert(cond: any, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

export type KeyRegistry = { currentId: number; keys: Record<number, Buffer> };
export function loadKeyRegistry(): KeyRegistry {
  const idRaw = ENV.APP_ENC_KEY_ID;
  const regRaw = ENV.APP_ENC_KEYS;

  assert(idRaw, 'APP_ENC_KEY_ID missing');
  assert(regRaw, 'APP_ENC_KEYS missing');

  const currentId = Number(idRaw);
  assert(Number.isInteger(currentId), 'APP_ENC_KEY_ID must be an integer');

  const keys: Record<number, Buffer> = {};
  for (const part of regRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)) {
    const [idStr, b64] = part.split(':');
    const id = Number(idStr);
    assert(Number.isInteger(id), `Invalid key id: ${idStr}`);
    const buf = Buffer.from(b64, 'base64');
    assert(buf.length === 32, `Key ${id} must be 32 bytes`);
    keys[id] = buf;
  }

  assert(keys[currentId], 'Current key id not found in APP_ENC_KEYS');
  return { currentId, keys };
}
