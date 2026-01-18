const SCALE = 1_000_000n;

export function parseMoneyToMicros(value: string): bigint {
  const trimmed = value.trim();
  if (!/^\d+(\.\d{1,6})?$/.test(trimmed)) {
    throw new Error(`Invalid money string: "${value}"`);
  }

  const [intPart, fracPartRaw] = trimmed.split('.');
  const fracPart = (fracPartRaw ?? '').padEnd(6, '0');
  return BigInt(intPart) * SCALE + BigInt(fracPart);
}

export function formatMicrosToMoney(
  micros: bigint,
  options?: { decimals?: 0 | 2 | 3 | 6 },
): string {
  const decimals = options?.decimals ?? 2;
  const sign = micros < 0n ? '-' : '';
  const abs = micros < 0n ? -micros : micros;

  const intPart = abs / SCALE;
  const fracPart = abs % SCALE;

  if (decimals === 0) return `${sign}${intPart.toString()}`;

  const frac6 = fracPart.toString().padStart(6, '0');
  const frac = frac6.slice(0, decimals);
  return `${sign}${intPart.toString()}.${frac}`;
}

export function addMicros(a: bigint, b: bigint): bigint {
  return a + b;
}

export function subMicros(a: bigint, b: bigint): bigint {
  return a - b;
}

export function divRoundMicros(numerator: bigint, divisor: bigint): bigint {
  if (divisor === 0n) throw new Error('Division by zero');
  const sign = (numerator < 0n ? -1n : 1n) * (divisor < 0n ? -1n : 1n);
  const absNum = numerator < 0n ? -numerator : numerator;
  const absDiv = divisor < 0n ? -divisor : divisor;

  const q = absNum / absDiv;
  const r = absNum % absDiv;
  const rounded = r * 2n >= absDiv ? q + 1n : q;
  return sign < 0n ? -rounded : rounded;
}

