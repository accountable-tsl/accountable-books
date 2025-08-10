async function sha256Bytes(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Fallback: FNV-1a (32-bit) over bytes + metadata (non-crypto; temporary)
function fnv1a(bytes: Uint8Array, file: File): string {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193) >>> 0; // * 16777619
  }
  // Mix in metadata to reduce obvious collisions
  const mix = new TextEncoder().encode(
    `${file.name}|${file.size}|${file.lastModified}`
  );
  for (let i = 0; i < mix.length; i++) {
    h ^= mix[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export async function generateFingerprint(file: File): Promise<string> {
  const buf = await file.arrayBuffer(); // hash REAL bytes
  const bytes = new Uint8Array(buf);
  if (globalThis.crypto?.subtle) {
    try {
      return await sha256Bytes(buf);
    } catch (error) {
      console.warn("SHA-256 failed, falling back to FNV-1a");
    }
  }
  // Fallback (non-crypto). Replace later with server-side SHA-256.
  return fnv1a(bytes, file);
}

function generateSourceMetadata(file: File) {
  return {
    fileName: file.name ?? "",
    fileSize: file.size ?? 0,
    fileType: file.type ?? "",
    uploadedAt: new Date().toISOString(),
  };
}

export async function generateMeta(file: File) {
  const fingerprint = await generateFingerprint(file);
  return {
    fingerprint,
    sourceMetadata: {
      ...generateSourceMetadata(file),
      fingerprint,
    },
  };
}
