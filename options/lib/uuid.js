// Stronger ID generator: prefer crypto.randomUUID, fallback to RFC4122 v4-like
export function generateId(prefix = 'r_') {
  try {
    if (globalThis.crypto?.randomUUID) {
      return prefix + globalThis.crypto.randomUUID();
    }
  } catch {}
  const buf = new Uint8Array(16);
  (globalThis.crypto?.getRandomValues?.(buf)) || (function () {
    for (let i = 0; i < buf.length; i++) buf[i] = Math.floor(Math.random() * 256);
  })();
  // Set version and variant bits for v4
  buf[6] = (buf[6] & 0x0f) | 0x40;
  buf[8] = (buf[8] & 0x3f) | 0x80;
  const hex = [...buf].map(b => b.toString(16).padStart(2, '0'));
  const uuid = `${hex[0]}${hex[1]}${hex[2]}${hex[3]}-${hex[4]}${hex[5]}-${hex[6]}${hex[7]}-${hex[8]}${hex[9]}-${hex[10]}${hex[11]}${hex[12]}${hex[13]}${hex[14]}${hex[15]}`;
  return prefix + uuid;
}
