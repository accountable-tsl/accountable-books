import crypto from 'crypto';
import bcrypt from 'bcrypt';

import { loadKeyRegistry } from '../../config/enc-config.js';

export function generateRandomToken(length = 48): string {
  return crypto.randomBytes(length).toString('hex');
}

export const hashToken = async (password: string) => bcrypt.hash(password, 12);

export const hashPassword = async (password: string) =>
  bcrypt.hash(password, 12);
export const comparePassword = async (input: string, hash: string) =>
  bcrypt.compare(input, hash);

export const compareToken = async ({
  token,
  hash,
}: {
  token: string;
  hash: string;
}) => bcrypt.compare(token, hash);

// Define a safe Base58 alphabet (avoiding ambiguous characters).
const SAFE_BASE58 =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

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

export function shortCodelooksWeird(
  code: string,
  maxRunLength?: number,
): boolean {
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

/** Read the key id from an encryption envelope without decrypting its payload. */
export function getCiphertextKeyId(token: string): number {
  const data = Buffer.from(token, 'base64');
  if (data.length < 1 + IV_LEN + TAG_LEN) {
    throw new Error('Ciphertext too short');
  }
  return data.readUInt8(0);
}

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

  const ct = Buffer.concat([
    cipher.update(Buffer.from(plaintext, 'utf8')),
    cipher.final(),
  ]);
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

export interface FingerprintOptions {
  sortKeys?: boolean;
  sortArrays?: boolean;
  separator?: string;
  encoding?: 'hex' | 'base64';
  length?: number;
}

export type Fingerprint = string & { __brand: 'Fingerprint' };
export type Checksum = string & { __brand: 'Checksum' };

export interface FileLike {
  arrayBuffer(): Promise<ArrayBuffer>;
  size: number;
  type: string;
  name?: string;
}

export function isFileLike(obj: unknown): obj is FileLike {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'arrayBuffer' in obj &&
    typeof (obj as FileLike).arrayBuffer === 'function' &&
    'size' in obj &&
    'type' in obj
  );
}

function normalizeData<T>(data: T, options: FingerprintOptions = {}): string {
  const { separator = '|', sortKeys = true, sortArrays = true } = options;

  if (data === null || data === undefined) {
    return String(data);
  }

  if (typeof data === 'string') {
    return data;
  }

  if (
    typeof data === 'number' ||
    typeof data === 'boolean' ||
    typeof data === 'bigint'
  ) {
    return String(data);
  }

  if (typeof data === 'symbol') {
    return data.toString();
  }

  if (isFileLike(data)) {
    throw new Error('Use fingerprintFile for file-like objects');
  }

  if (Array.isArray(data)) {
    let processedArray = data.map((item) => normalizeData(item, options));
    if (sortArrays) {
      processedArray = [...processedArray].sort();
    }
    return processedArray.join(separator);
  }

  if (typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    const keys = sortKeys ? Object.keys(obj).sort() : Object.keys(obj);
    const normalizedObj: Record<string, string> = {};

    for (const key of keys) {
      normalizedObj[key] = normalizeData(obj[key], options);
    }

    return JSON.stringify(normalizedObj);
  }

  if (typeof data === 'function') {
    return data.toString();
  }

  return String(data);
}

function formatDigest(
  digest: string,
  { encoding = 'hex', length }: FingerprintOptions = {},
): Fingerprint {
  let formatted = digest;

  if (encoding === 'base64') {
    const bytes = Buffer.from(digest, 'hex');
    formatted = bytes.toString('base64');
  }

  if (length) {
    formatted = formatted.slice(0, length);
  }

  return formatted as Fingerprint;
}

export async function generateFingerprint<T>(
  data: T,
  options: FingerprintOptions = {},
): Promise<Fingerprint> {
  const normalized = normalizeData(data, options);
  const buffer = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return formatDigest(hex, options);
}
export const generateChecksum = generateFingerprint;

export function generateFingerprintSync<T>(
  data: T,
  options: FingerprintOptions = {},
): Fingerprint {
  const normalized = normalizeData(data, options);
  const encoding = options.encoding === 'base64' ? 'base64' : 'hex';
  const digest = crypto
    .createHash('sha256')
    .update(normalized)
    .digest(encoding);
  const formatted = options.length ? digest.slice(0, options.length) : digest;
  return formatted as Fingerprint;
}
export const generateChecksumSync = generateFingerprintSync;

export async function fingerprintArray<T>(
  array: T[],
  options: FingerprintOptions & { sortItems?: boolean } = {},
): Promise<Fingerprint> {
  const { sortItems = false, ...fingerprintOptions } = options;

  let processedArray = array;
  if (sortItems) {
    processedArray = [...array].sort();
  }

  return generateFingerprint(processedArray, fingerprintOptions);
}
export const checksumArray = fingerprintArray;

export async function fingerprintObject<T extends Record<string, unknown>>(
  obj: T,
  options: FingerprintOptions = {},
): Promise<Fingerprint> {
  return generateFingerprint(obj, options);
}
export const checksumObject = fingerprintObject;

export async function fingerprintString(
  str: string,
  options: FingerprintOptions = {},
): Promise<Fingerprint> {
  return generateFingerprint(str, options);
}
export const checksumString = fingerprintString;

export async function fingerprintFile(
  file: FileLike,
  options: FingerprintOptions = {},
): Promise<Fingerprint> {
  const arrayBuffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return formatDigest(hex, options);
}
export const checksumFile = fingerprintFile;

export function isValidFingerprint(
  fingerprint: unknown,
  { encoding = 'hex', length }: FingerprintOptions = {},
): fingerprint is Fingerprint {
  if (typeof fingerprint !== 'string') {
    return false;
  }

  if (encoding === 'base64') {
    const base64Pattern = /^[A-Za-z0-9+/]+={0,2}$/;
    if (!base64Pattern.test(fingerprint)) {
      return false;
    }
    if (length && fingerprint.length !== length) {
      return false;
    }
    return true;
  }

  const expectedLength = length ?? 64;
  const hexPattern = new RegExp(`^[0-9a-f]{${expectedLength}}$`, 'i');
  return hexPattern.test(fingerprint);
}
export const isValidChecksum = isValidFingerprint;

export function assertFingerprint(
  fingerprint: unknown,
  options: FingerprintOptions = {},
): asserts fingerprint is Fingerprint {
  if (!isValidFingerprint(fingerprint, options)) {
    throw new Error(`Invalid fingerprint format: ${String(fingerprint)}`);
  }
}
export const assertChecksum = assertFingerprint;

export const compareFingerprints = (
  fingerprint1: Fingerprint,
  fingerprint2: Fingerprint,
): boolean => {
  assertFingerprint(fingerprint1);
  assertFingerprint(fingerprint2);
  return fingerprint1.toLowerCase() === fingerprint2.toLowerCase();
};
export const compareChecksums = compareFingerprints;

export const safeFingerprint = async <T>(
  data: T,
  fallback: Fingerprint | null = null,
): Promise<Fingerprint | null> => {
  try {
    return await generateFingerprint(data);
  } catch (error) {
    console.error('Fingerprint generation error:', error);
    return fallback;
  }
};
export const safeChecksum = safeFingerprint;

export const createFingerprint = (fingerprint: string): Fingerprint => {
  if (!isValidFingerprint(fingerprint)) {
    throw new Error(
      `Cannot create fingerprint from invalid string: ${fingerprint}`,
    );
  }
  return fingerprint as Fingerprint;
};
export const createChecksum = createFingerprint;
