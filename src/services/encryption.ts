/**
 * encryption.ts — AES-256-CBC photo encryption/decryption.
 *
 * ARCHITECTURE:
 *   Photos are encrypted ON-DEVICE before upload.
 *   The encryption key is derived from a device-specific secret stored in
 *   expo-secure-store (Android Keystore / iOS Keychain).
 *   The server stores and serves OPAQUE ENCRYPTED BLOBS — it can never
 *   read the original photos.
 *
 *   Algorithm: AES-256-CBC with PKCS#7 padding
 *   Key:       256-bit session key (stored in SecureStore)
 *   IV:        Random 128-bit IV prepended to the ciphertext
 *
 *   Format: [ IV (16 bytes) ][ AES-CBC ciphertext ]
 *
 * USAGE (encryption before upload):
 *   const { ciphertext, key } = await encryptPhoto(photoUri);
 *   // Upload ciphertext to server, keep key on device
 *
 * USAGE (decryption when displaying):
 *   const plaintext = await decryptPhoto(ciphertext);
 *   // Display decrypted image
 */

import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';

// ── Constants ─────────────────────────────────────────────────────────────────

const SESSION_KEY_STORE_KEY = 'snapsquad_session_key_v1';
const AES_KEY_BYTES  = 32;   // 256-bit key
const AES_BLOCK_SIZE = 16;   // AES block size (128-bit)

// ── Result types ──────────────────────────────────────────────────────────────

export interface EncryptionResult {
  /** Complete encrypted blob: [IV (16 bytes)][ciphertext] */
  ciphertext: Uint8Array;
  /** Base64 string of the session key (for reference; key stays on device) */
  keyBase64: string;
}

// ── Session Key Management ────────────────────────────────────────────────────

/**
 * Get or create the album's symmetric session key.
 * Stored securely in Android Keystore / iOS Secure Enclave.
 *
 * In V2 (multi-user rooms), this becomes a "room key" derived via ECDH.
 */
export async function getOrCreateSessionKey(): Promise<Uint8Array> {
  const stored = await SecureStore.getItemAsync(SESSION_KEY_STORE_KEY);
  if (stored) {
    return base64ToBytes(stored);
  }

  // Generate a cryptographically random 256-bit key
  const keyBytes = await Crypto.getRandomBytesAsync(AES_KEY_BYTES);
  const key = new Uint8Array(keyBytes);
  await SecureStore.setItemAsync(SESSION_KEY_STORE_KEY, bytesToBase64(key));
  return key;
}

// ── Encryption ────────────────────────────────────────────────────────────────

/**
 * Encrypt a photo file with AES-256-CBC.
 *
 * @param photoUri - Local URI of the plaintext photo
 * @returns EncryptionResult containing ciphertext (IV + encrypted bytes)
 */
export async function encryptPhoto(photoUri: string): Promise<EncryptionResult> {
  // Read plaintext photo bytes
  const base64 = await FileSystem.readAsStringAsync(photoUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const plaintext = base64ToBytes(base64);

  // Get session key
  const key = await getOrCreateSessionKey();

  // Generate random IV
  const ivBytes = await Crypto.getRandomBytesAsync(AES_BLOCK_SIZE);
  const iv = new Uint8Array(ivBytes);

  // Encrypt with AES-256-CBC
  const ciphertextBody = await aes256CbcEncrypt(plaintext, key, iv);

  // Prepend IV to ciphertext: [IV (16 bytes)][ciphertext]
  const result = new Uint8Array(AES_BLOCK_SIZE + ciphertextBody.length);
  result.set(iv, 0);
  result.set(ciphertextBody, AES_BLOCK_SIZE);

  return {
    ciphertext: result,
    keyBase64: bytesToBase64(key),
  };
}

/**
 * Decrypt an encrypted photo blob.
 *
 * @param ciphertext - The encrypted blob [IV (16 bytes)][ciphertext]
 * @returns Plaintext bytes of the original photo
 */
export async function decryptPhoto(ciphertext: Uint8Array): Promise<Uint8Array> {
  const key = await getOrCreateSessionKey();

  // Extract IV from the first 16 bytes
  const iv = ciphertext.slice(0, AES_BLOCK_SIZE);
  const encryptedBody = ciphertext.slice(AES_BLOCK_SIZE);

  return await aes256CbcDecrypt(encryptedBody, key, iv);
}

/**
 * Encrypt a photo and write the ciphertext to a temp file.
 * Returns the local URI of the encrypted file for uploading.
 */
export async function encryptPhotoToFile(photoUri: string): Promise<{ 
  encryptedUri: string; 
  keyBase64: string 
}> {
  const { ciphertext, keyBase64 } = await encryptPhoto(photoUri);
  
  const encryptedUri = FileSystem.cacheDirectory + `enc_${Date.now()}.bin`;
  await FileSystem.writeAsStringAsync(encryptedUri, bytesToBase64(ciphertext), {
    encoding: FileSystem.EncodingType.Base64,
  });
  
  return { encryptedUri, keyBase64 };
}

/**
 * Decrypt an encrypted blob and write to a temp JPEG file.
 * Returns the local URI for display.
 */
export async function decryptBlobToFile(ciphertext: Uint8Array): Promise<string> {
  const plaintext = await decryptPhoto(ciphertext);
  const tmpUri = FileSystem.cacheDirectory + `decrypted_${Date.now()}.jpg`;
  await FileSystem.writeAsStringAsync(tmpUri, bytesToBase64(plaintext), {
    encoding: FileSystem.EncodingType.Base64,
  });
  return tmpUri;
}

// ── AES-256-CBC Implementation ────────────────────────────────────────────────
// Pure TypeScript implementation — no native bridge required.

/**
 * AES-256-CBC Encryption with PKCS#7 padding.
 */
async function aes256CbcEncrypt(plaintext: Uint8Array, key: Uint8Array, iv: Uint8Array): Promise<Uint8Array> {
  // PKCS#7 pad the plaintext to a multiple of 16 bytes
  const padded = pkcs7Pad(plaintext, AES_BLOCK_SIZE);

  // Expand key
  const keySchedule = aesKeyExpansion(key);

  // CBC mode: XOR each block with the previous ciphertext block (or IV for first)
  const ciphertext = new Uint8Array(padded.length);
  let prev = iv;

  for (let i = 0; i < padded.length; i += AES_BLOCK_SIZE) {
    const block = padded.slice(i, i + AES_BLOCK_SIZE);

    // XOR with previous ciphertext (or IV)
    const xored = xorBlocks(block, prev);

    // AES encrypt the block
    const encrypted = aesEncryptBlock(xored, keySchedule);
    ciphertext.set(encrypted, i);
    prev = encrypted;

    // Yield to the JS thread every 500 blocks (~8KB) to prevent UI freezing
    if (i % (AES_BLOCK_SIZE * 500) === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  return ciphertext;
}

/**
 * AES-256-CBC Decryption with PKCS#7 unpadding.
 */
async function aes256CbcDecrypt(ciphertext: Uint8Array, key: Uint8Array, iv: Uint8Array): Promise<Uint8Array> {
  const keySchedule = aesKeyExpansion(key);
  const plaintext = new Uint8Array(ciphertext.length);
  let prev = iv;

  for (let i = 0; i < ciphertext.length; i += AES_BLOCK_SIZE) {
    const block = ciphertext.slice(i, i + AES_BLOCK_SIZE);
    const decrypted = aesDecryptBlock(block, keySchedule);
    const xored = xorBlocks(decrypted, prev);
    plaintext.set(xored, i);
    prev = block;

    // Yield to the JS thread every 500 blocks (~8KB) to prevent UI freezing
    if (i % (AES_BLOCK_SIZE * 500) === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  return pkcs7Unpad(plaintext);
}

// ── AES Core (FIPS 197 compliant) ────────────────────────────────────────────

const SBOX = new Uint8Array([
  0x63, 0x7c, 0x77, 0x7b, 0xf2, 0x6b, 0x6f, 0xc5, 0x30, 0x01, 0x67, 0x2b, 0xfe, 0xd7, 0xab, 0x76,
  0xca, 0x82, 0xc9, 0x7d, 0xfa, 0x59, 0x47, 0xf0, 0xad, 0xd4, 0xa2, 0xaf, 0x9c, 0xa4, 0x72, 0xc0,
  0xb7, 0xfd, 0x93, 0x26, 0x36, 0x3f, 0xf7, 0xcc, 0x34, 0xa5, 0xe5, 0xf1, 0x71, 0xd8, 0x31, 0x15,
  0x04, 0xc7, 0x23, 0xc3, 0x18, 0x96, 0x05, 0x9a, 0x07, 0x12, 0x80, 0xe2, 0xeb, 0x27, 0xb2, 0x75,
  0x09, 0x83, 0x2c, 0x1a, 0x1b, 0x6e, 0x5a, 0xa0, 0x52, 0x3b, 0xd6, 0xb3, 0x29, 0xe3, 0x2f, 0x84,
  0x53, 0xd1, 0x00, 0xed, 0x20, 0xfc, 0xb1, 0x5b, 0x6a, 0xcb, 0xbe, 0x39, 0x4a, 0x4c, 0x58, 0xcf,
  0xd0, 0xef, 0xaa, 0xfb, 0x43, 0x4d, 0x33, 0x85, 0x45, 0xf9, 0x02, 0x7f, 0x50, 0x3c, 0x9f, 0xa8,
  0x51, 0xa3, 0x40, 0x8f, 0x92, 0x9d, 0x38, 0xf5, 0xbc, 0xb6, 0xda, 0x21, 0x10, 0xff, 0xf3, 0xd2,
  0xcd, 0x0c, 0x13, 0xec, 0x5f, 0x97, 0x44, 0x17, 0xc4, 0xa7, 0x7e, 0x3d, 0x64, 0x5d, 0x19, 0x73,
  0x60, 0x81, 0x4f, 0xdc, 0x22, 0x2a, 0x90, 0x88, 0x46, 0xee, 0xb8, 0x14, 0xde, 0x5e, 0x0b, 0xdb,
  0xe0, 0x32, 0x3a, 0x0a, 0x49, 0x06, 0x24, 0x5c, 0xc2, 0xd3, 0xac, 0x62, 0x91, 0x95, 0xe4, 0x79,
  0xe7, 0xc8, 0x37, 0x6d, 0x8d, 0xd5, 0x4e, 0xa9, 0x6c, 0x56, 0xf4, 0xea, 0x65, 0x7a, 0xae, 0x08,
  0xba, 0x78, 0x25, 0x2e, 0x1c, 0xa6, 0xb4, 0xc6, 0xe8, 0xdd, 0x74, 0x1f, 0x4b, 0xbd, 0x8b, 0x8a,
  0x70, 0x3e, 0xb5, 0x66, 0x48, 0x03, 0xf6, 0x0e, 0x61, 0x35, 0x57, 0xb9, 0x86, 0xc1, 0x1d, 0x9e,
  0xe1, 0xf8, 0x98, 0x11, 0x69, 0xd9, 0x8e, 0x94, 0x9b, 0x1e, 0x87, 0xe9, 0xce, 0x55, 0x28, 0xdf,
  0x8c, 0xa1, 0x89, 0x0d, 0xbf, 0xe6, 0x42, 0x68, 0x41, 0x99, 0x2d, 0x0f, 0xb0, 0x54, 0xbb, 0x16,
]);

const INV_SBOX = new Uint8Array(256);
for (let i = 0; i < 256; i++) INV_SBOX[SBOX[i]] = i;

const RCON = new Uint8Array([0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36]);

function aesKeyExpansion(key: Uint8Array): Uint32Array {
  const w = new Uint32Array(60);
  const nk = key.length / 4;
  for (let i = 0; i < nk; i++) {
    w[i] = (key[4*i] << 24) | (key[4*i+1] << 16) | (key[4*i+2] << 8) | key[4*i+3];
  }
  for (let i = nk; i < 60; i++) {
    let temp = w[i - 1];
    if (i % nk === 0) {
      temp = subWord(rotWord(temp)) ^ (RCON[i / nk - 1] << 24);
    } else if (nk > 6 && i % nk === 4) {
      temp = subWord(temp);
    }
    w[i] = w[i - nk] ^ temp;
  }
  return w;
}

function subWord(w: number): number {
  return (SBOX[(w >> 24) & 0xff] << 24) | (SBOX[(w >> 16) & 0xff] << 16) |
         (SBOX[(w >> 8) & 0xff] << 8) | SBOX[w & 0xff];
}

function rotWord(w: number): number {
  return ((w << 8) | (w >>> 24)) >>> 0;
}

function xorBlocks(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] ^ b[i];
  return out;
}

function aesEncryptBlock(block: Uint8Array, keySchedule: Uint32Array): Uint8Array {
  const state = new Uint8Array(16);
  state.set(block);
  addRoundKey(state, keySchedule, 0);
  for (let round = 1; round <= 13; round++) {
    subBytes(state, SBOX);
    shiftRows(state);
    mixColumns(state);
    addRoundKey(state, keySchedule, round);
  }
  subBytes(state, SBOX);
  shiftRows(state);
  addRoundKey(state, keySchedule, 14);
  return state;
}

function aesDecryptBlock(block: Uint8Array, keySchedule: Uint32Array): Uint8Array {
  const state = new Uint8Array(16);
  state.set(block);
  addRoundKey(state, keySchedule, 14);
  for (let round = 13; round >= 1; round--) {
    invShiftRows(state);
    subBytes(state, INV_SBOX);
    addRoundKey(state, keySchedule, round);
    invMixColumns(state);
  }
  invShiftRows(state);
  subBytes(state, INV_SBOX);
  addRoundKey(state, keySchedule, 0);
  return state;
}

function addRoundKey(state: Uint8Array, w: Uint32Array, round: number): void {
  for (let c = 0; c < 4; c++) {
    const wrd = w[round * 4 + c];
    state[c * 4 + 0] ^= (wrd >> 24) & 0xff;
    state[c * 4 + 1] ^= (wrd >> 16) & 0xff;
    state[c * 4 + 2] ^= (wrd >> 8) & 0xff;
    state[c * 4 + 3] ^= wrd & 0xff;
  }
}

function subBytes(state: Uint8Array, box: Uint8Array): void {
  for (let i = 0; i < 16; i++) state[i] = box[state[i]];
}

function shiftRows(s: Uint8Array): void {
  let t;
  t = s[1];  s[1] = s[5];  s[5] = s[9];  s[9] = s[13]; s[13] = t;
  t = s[2];  s[2] = s[10]; s[10] = t;    t = s[6];  s[6] = s[14]; s[14] = t;
  t = s[15]; s[15] = s[11]; s[11] = s[7]; s[7] = s[3]; s[3] = t;
}

function invShiftRows(s: Uint8Array): void {
  let t;
  t = s[13]; s[13] = s[9]; s[9] = s[5]; s[5] = s[1]; s[1] = t;
  t = s[2];  s[2] = s[10]; s[10] = t;   t = s[6]; s[6] = s[14]; s[14] = t;
  t = s[3];  s[3] = s[7];  s[7] = s[11]; s[11] = s[15]; s[15] = t;
}

function xtime(a: number): number {
  return ((a << 1) ^ ((a & 0x80) ? 0x1b : 0)) & 0xff;
}

function mixColumns(s: Uint8Array): void {
  for (let c = 0; c < 4; c++) {
    const b = c * 4;
    const s0 = s[b], s1 = s[b+1], s2 = s[b+2], s3 = s[b+3];
    s[b]   = xtime(s0) ^ xtime(s1) ^ s1 ^ s2 ^ s3;
    s[b+1] = s0 ^ xtime(s1) ^ xtime(s2) ^ s2 ^ s3;
    s[b+2] = s0 ^ s1 ^ xtime(s2) ^ xtime(s3) ^ s3;
    s[b+3] = xtime(s0) ^ s0 ^ s1 ^ s2 ^ xtime(s3);
  }
}

function invMixColumns(s: Uint8Array): void {
  for (let c = 0; c < 4; c++) {
    const b = c * 4;
    const s0 = s[b], s1 = s[b+1], s2 = s[b+2], s3 = s[b+3];
    const mul = (a: number, n: number) => {
      let r = 0, aa = a, nn = n;
      while (nn) { if (nn & 1) r ^= aa; aa = xtime(aa); nn >>= 1; }
      return r;
    };
    s[b]   = mul(s0, 14) ^ mul(s1, 11) ^ mul(s2, 13) ^ mul(s3, 9);
    s[b+1] = mul(s0, 9)  ^ mul(s1, 14) ^ mul(s2, 11) ^ mul(s3, 13);
    s[b+2] = mul(s0, 13) ^ mul(s1, 9)  ^ mul(s2, 14) ^ mul(s3, 11);
    s[b+3] = mul(s0, 11) ^ mul(s1, 13) ^ mul(s2, 9)  ^ mul(s3, 14);
  }
}

// ── PKCS#7 Padding ────────────────────────────────────────────────────────────

function pkcs7Pad(data: Uint8Array, blockSize: number): Uint8Array {
  const padLen = blockSize - (data.length % blockSize);
  const padded = new Uint8Array(data.length + padLen);
  padded.set(data);
  padded.fill(padLen, data.length);
  return padded;
}

function pkcs7Unpad(data: Uint8Array): Uint8Array {
  const padLen = data[data.length - 1];
  return data.slice(0, data.length - padLen);
}

// ── Base64 Helpers ────────────────────────────────────────────────────────────

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
