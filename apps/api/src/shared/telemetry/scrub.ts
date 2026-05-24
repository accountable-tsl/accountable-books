// Normalized sensitive key patterns (lowercase, hyphens/underscores stripped)
const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'secret',
  'authorization',
  'cookie',
  'accountnumber',
  'taxid',
  'ssn',
  'sortcode',
  'iban',
  'cardnumber',
  'cvv',
  'pin',
  'privatekey',
  'apikey',
  'otp',
  'verificationtoken',
  'refreshtoken',
  'accesstoken',
]);

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(key.toLowerCase().replace(/[_-]/g, ''));
}

export function scrubForTelemetry<T>(value: T, depth = 0): T {
  if (depth > 10 || value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map((item) =>
      scrubForTelemetry(item, depth + 1),
    ) as unknown as T;
  }
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    result[key] = isSensitiveKey(key)
      ? '[REDACTED]'
      : scrubForTelemetry(val, depth + 1);
  }
  return result as T;
}
