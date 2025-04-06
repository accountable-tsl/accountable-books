import crypto from "crypto";

// Define a safe Base58 alphabet (avoiding ambiguous characters).
const SAFE_BASE58 =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/**
 * Generates a secure random short code using the SAFE_BASE58 alphabet.
 * Uses rejection sampling to ensure a uniform distribution.
 *
 * @param length - The desired length of the short code (default 8).
 * @returns A secure, random short code.
 */
export default function generateSecureShortCode(length = 8): string {
  let code = "";
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

