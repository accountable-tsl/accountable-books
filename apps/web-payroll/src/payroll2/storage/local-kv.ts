export async function localGet(key: string): Promise<unknown | undefined> {
  const raw = localStorage.getItem(key);
  if (raw == null) return undefined;
  return JSON.parse(raw) as unknown;
}

export async function localSet(key: string, value: unknown): Promise<void> {
  localStorage.setItem(key, JSON.stringify(value));
}

export async function localDel(key: string): Promise<void> {
  localStorage.removeItem(key);
}

