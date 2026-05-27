type CreateIdOptions = {
  prefix?: string;
  includePrefix?: boolean;
};

export function createId(options: CreateIdOptions = {}): string {
  const { prefix, includePrefix = true } = options;

  const baseId =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  if (prefix && includePrefix) {
    return `${prefix}${baseId}`;
  }

  return baseId;
}
