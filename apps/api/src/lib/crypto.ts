import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

/**
 * AES-256-GCM at-rest encryption for sensitive columns (BYOK API keys,
 * agent memories, etc.). Rolling-encryption model:
 *
 *   - All NEW writes go through encrypt(). Output starts with the `enc:v1:`
 *     tag so decryptMaybe() can tell encrypted from legacy plaintext.
 *   - Reads use decryptMaybe(), which passes plaintext through untouched
 *     and decrypts tagged ciphertext. Legacy rows stay readable until they
 *     are re-saved (which triggers re-encryption).
 *
 * The 32-byte AES key is derived from process.env.ENCRYPTION_KEY via scrypt
 * with a fixed app salt. ENCRYPTION_KEY presence is enforced at boot
 * (see apps/api/src/index.ts). Rotating the env value would invalidate
 * existing ciphertext — when that day comes, ship a migration that
 * decrypts-with-old, re-encrypts-with-new in batches.
 */

const TAG_PREFIX = 'enc:v1:'
const APP_SALT   = Buffer.from('slateops-at-rest-v1', 'utf8')

let _key: Buffer | null = null
function key(): Buffer {
  if (_key) return _key
  const env = process.env.ENCRYPTION_KEY
  if (!env || env.length < 32) {
    throw new Error('ENCRYPTION_KEY must be set (≥32 chars) before crypto helpers are used')
  }
  _key = scryptSync(env, APP_SALT, 32)
  return _key
}

export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(TAG_PREFIX)
}

/**
 * Encrypt a plaintext string. Returns a tagged base64 blob:
 *   enc:v1:<base64(iv|tag|ciphertext)>
 *
 * Pass-through for null/undefined so callers can do `data.byokKey ?? null`.
 */
export function encrypt(plaintext: string): string
export function encrypt(plaintext: null | undefined): null
export function encrypt(plaintext: string | null | undefined): string | null
export function encrypt(plaintext: string | null | undefined): string | null {
  if (plaintext == null) return null
  if (isEncrypted(plaintext)) return plaintext  // already encrypted — no double-wrap
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const ct  = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return TAG_PREFIX + Buffer.concat([iv, tag, ct]).toString('base64')
}

/**
 * Decrypt a tagged ciphertext. Returns input unchanged if not tagged
 * (legacy plaintext during rolling migration).
 */
export function decryptMaybe(value: string | null | undefined): string | null {
  if (value == null) return null
  if (!isEncrypted(value)) return value
  const raw = Buffer.from(value.slice(TAG_PREFIX.length), 'base64')
  const iv  = raw.subarray(0, 12)
  const tag = raw.subarray(12, 28)
  const ct  = raw.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', key(), iv)
  decipher.setAuthTag(tag)
  const pt = Buffer.concat([decipher.update(ct), decipher.final()])
  return pt.toString('utf8')
}

// Named aliases for call-site clarity. Both are decryptMaybe under the hood —
// during the rolling migration they happily pass legacy plaintext through.
export const decryptByokKey       = decryptMaybe
export const decryptMemoryValue   = decryptMaybe
