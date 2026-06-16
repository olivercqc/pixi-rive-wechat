// Decode standard padded base64 to bytes without `atob` (not available in the
// WeChat mini-game runtime). Use to inline a `.riv` into the bundle, since WeChat
// dev-tools strips unreferenced/unknown package files (`.riv`).
const LOOKUP = ((): Uint8Array => {
  const table = new Uint8Array(256);
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  for (let i = 0; i < chars.length; i += 1) {
    table[chars.charCodeAt(i)] = i;
  }
  return table;
})();

export function base64ToUint8Array(base64: string): Uint8Array {
  const length = base64.length;
  let padding = 0;
  if (length > 0 && base64.charCodeAt(length - 1) === 61) {
    padding += 1; // '='
  }
  if (length > 1 && base64.charCodeAt(length - 2) === 61) {
    padding += 1;
  }
  const bytes = new Uint8Array(Math.max(0, (length / 4) * 3 - padding));

  let p = 0;
  for (let i = 0; i < length; i += 4) {
    const e1 = LOOKUP[base64.charCodeAt(i)] ?? 0;
    const e2 = LOOKUP[base64.charCodeAt(i + 1)] ?? 0;
    const e3 = LOOKUP[base64.charCodeAt(i + 2)] ?? 0;
    const e4 = LOOKUP[base64.charCodeAt(i + 3)] ?? 0;
    if (p < bytes.length) {
      bytes[p++] = (e1 << 2) | (e2 >> 4);
    }
    if (p < bytes.length) {
      bytes[p++] = ((e2 & 15) << 4) | (e3 >> 2);
    }
    if (p < bytes.length) {
      bytes[p++] = ((e3 & 3) << 6) | e4;
    }
  }
  return bytes;
}
