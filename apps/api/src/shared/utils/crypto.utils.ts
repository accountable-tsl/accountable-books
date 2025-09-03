import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { loadKeyRegistry } from 'src/config/enc-config.js';

export function generateRandomToken(length = 48): string {
  return crypto.randomBytes(length).toString('hex');
}

export const hashToken = async (password: string) => bcrypt.hash(password, 12);

export const hashPassword = async (password: string) => bcrypt.hash(password, 12);
export const comparePassword = async (input: string, hash: string) => bcrypt.compare(input, hash);

export const compareToken = async ({ token, hash }: { token: string; hash: string }) =>
  bcrypt.compare(token, hash);

// Define a safe Base58 alphabet (avoiding ambiguous characters).
const SAFE_BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/**
 * Generates a secure random short code using the SAFE_BASE58 alphabet.
 * Uses rejection sampling to ensure a uniform distribution.
 *
 * @param length - The desired length of the short code (default 8).
 * @returns A secure, random short code.
 */
export default function generateSecureShortCode(length = 8): string {
  let code = '';
  const maxByte = 232; // 58 * 4 = 232 (avoids modulo bias)

  // Keep generating random bytes until we have the desired length.
  while (code.length < length) {
    // Generate one random byte.
    const byte = crypto.randomBytes(1)[0];

    // Only use the byte if it is within [0, 232) to avoid modulo bias.
    if (byte < maxByte) {
      code += SAFE_BASE58[byte % 58];
    }
  }

  return code;
}

export function shortCodelooksWeird(code: string, maxRunLength?: number): boolean {
  if (!maxRunLength) maxRunLength = Math.floor(code.length / 2);

  // Check for long runs of same character type
  return (
    new RegExp(`\\d{${maxRunLength},}`).test(code) || // 4+ consecutive digits
    new RegExp(`[A-Z]{${maxRunLength},}`).test(code) || // 4+ consecutive uppercase
    new RegExp(`[a-z]{${maxRunLength},}`).test(code)
  ); // 4+ consecutive lowercase
}

const { currentId: CURRENT_ID, keys: KEYS } = loadKeyRegistry();
const ALG = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

/**
 * Encrypt plaintext with the current key.
 * Optional `aad` binds the ciphertext to context (e.g. `${providerId}:${companyId}`).
 * Returns base64 string containing: [keyId(1B)] [iv(12)] [tag(16)] [ciphertext].
 */
export function encrypt(plaintext: string, aad?: string): string {
  const key = KEYS[CURRENT_ID];
  const iv = crypto.randomBytes(IV_LEN);

  const cipher = crypto.createCipheriv(ALG, key, iv);
  if (aad) cipher.setAAD(Buffer.from(aad, 'utf8'));

  const ct = Buffer.concat([cipher.update(Buffer.from(plaintext, 'utf8')), cipher.final()]);
  const tag = cipher.getAuthTag();

  const out = Buffer.concat([Buffer.from([CURRENT_ID]), iv, tag, ct]);
  return out.toString('base64');
}

/**
 * Decrypt ciphertext produced by `encrypt`.
 * Pass the same `aad` if one was used at encryption.
 */
export function decrypt(token: string, aad?: string): string {
  const data = Buffer.from(token, 'base64');

  if (data.length < 1 + IV_LEN + TAG_LEN) {
    throw new Error('Ciphertext too short');
  }

  const kid = data.readUInt8(0);
  const key = KEYS[kid];
  if (!key) throw new Error('Unknown key id');

  const iv = data.subarray(1, 1 + IV_LEN);
  const tag = data.subarray(1 + IV_LEN, 1 + IV_LEN + TAG_LEN);
  const ct = data.subarray(1 + IV_LEN + TAG_LEN);

  const decipher = crypto.createDecipheriv(ALG, key, iv);
  if (aad) decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(tag);

  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}
