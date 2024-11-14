export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  // Dekodiere den Base64-String in eine binäre Zeichenkette
  const binaryString =
    typeof atob === 'function'
      ? atob(base64) // Im Browser oder wenn `atob` verfügbar ist
      : Buffer.from(base64, 'base64').toString('binary'); // In Node.js

  // Erzeuge einen ArrayBuffer und fülle ihn mit den binären Daten
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  const base64Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

  let base64 = '';
  let i;
  for (i = 0; i < binary.length - 2; i += 3) {
    const triplet = (binary.charCodeAt(i) << 16) | (binary.charCodeAt(i + 1) << 8) | binary.charCodeAt(i + 2);

    base64 += base64Chars[(triplet >> 18) & 0x3f];
    base64 += base64Chars[(triplet >> 12) & 0x3f];
    base64 += base64Chars[(triplet >> 6) & 0x3f];
    base64 += base64Chars[triplet & 0x3f];
  }

  if (binary.length % 3 === 1) {
    const triplet = binary.charCodeAt(i) << 16;
    base64 += base64Chars[(triplet >> 18) & 0x3f];
    base64 += base64Chars[(triplet >> 12) & 0x3f];
    base64 += '==';
  } else if (binary.length % 3 === 2) {
    const triplet = (binary.charCodeAt(i) << 16) | (binary.charCodeAt(i + 1) << 8);
    base64 += base64Chars[(triplet >> 18) & 0x3f];
    base64 += base64Chars[(triplet >> 12) & 0x3f];
    base64 += base64Chars[(triplet >> 6) & 0x3f];
    base64 += '=';
  }

  return base64;
}

export function createArrayBuffer(str: string) {
  const enc = new TextEncoder();
  return enc.encode(str).buffer;
}
