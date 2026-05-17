/**
 * Rotate the at-rest encryption key for all enc:v1: ciphertext in the DB.
 *
 * Run BEFORE flipping ENCRYPTION_KEY in production so existing ciphertext
 * stays decryptable. Two env vars are required:
 *
 *   ENCRYPTION_KEY_OLD  — the current value (used to decrypt existing rows)
 *   ENCRYPTION_KEY      — the new value (used to re-encrypt; also what the
 *                         app boots with going forward)
 *
 * Typical procedure:
 *   1. Generate new key:   openssl rand -hex 32
 *   2. Set ENCRYPTION_KEY_OLD=<current> and ENCRYPTION_KEY=<new> in a one-off
 *      env file used only by this script.
 *   3. Run this script.
 *   4. Update the platform secret (Railway / Vercel) to the new ENCRYPTION_KEY.
 *   5. Redeploy. (No app downtime — encrypt() output starts with `enc:v1:` and
 *      old plaintext-or-newly-encrypted rows are both valid.)
 *
 * Safe to re-run: any row already encrypted with the NEW key is detected by
 * trial-decrypt and skipped. Plaintext (legacy) rows are encrypted with the
 * NEW key.
 *
 * Run:
 *   ENCRYPTION_KEY_OLD=<old> ENCRYPTION_KEY=<new> \
 *   pnpm --filter @agentcity/api exec tsx \
 *     --env-file=.env apps/api/src/scripts/rotate-encryption-key.ts
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import { prisma } from '../lib/prisma.js'

const TAG_PREFIX = 'enc:v1:'
const APP_SALT   = Buffer.from('slateops-at-rest-v1', 'utf8')
const PAGE_SIZE  = 500

function deriveKey(envValue: string): Buffer {
  if (!envValue || envValue.length < 32) {
    throw new Error('Key must be at least 32 characters')
  }
  return scryptSync(envValue, APP_SALT, 32)
}

function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(TAG_PREFIX)
}

function encryptWith(key: Buffer, plaintext: string): string {
  const iv     = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ct     = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag    = cipher.getAuthTag()
  return TAG_PREFIX + Buffer.concat([iv, tag, ct]).toString('base64')
}

function tryDecryptWith(key: Buffer, tagged: string): string | null {
  try {
    const raw = Buffer.from(tagged.slice(TAG_PREFIX.length), 'base64')
    const iv  = raw.subarray(0, 12)
    const tag = raw.subarray(12, 28)
    const ct  = raw.subarray(28)
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}

interface Counters { scanned: number; rotated: number; legacy: number; alreadyNew: number; broken: number }

async function rotateValue(
  current: string | null,
  oldKey: Buffer,
  newKey: Buffer,
  counters: Counters,
): Promise<string | null | undefined> {
  // Returns:
  //   undefined → no write needed (already on the new key)
  //   string    → new ciphertext to persist
  //   null      → could not be decrypted with either key; left untouched

  counters.scanned++
  if (current == null) return undefined

  if (!isEncrypted(current)) {
    // Legacy plaintext — encrypt with the new key.
    counters.legacy++
    return encryptWith(newKey, current)
  }

  // Already encrypted. Try the NEW key first — if it works, the row was
  // rotated on an earlier pass.
  if (tryDecryptWith(newKey, current) != null) {
    counters.alreadyNew++
    return undefined
  }

  // Decrypt with the OLD key, then re-encrypt with the NEW key.
  const plain = tryDecryptWith(oldKey, current)
  if (plain == null) {
    counters.broken++
    return null
  }
  counters.rotated++
  return encryptWith(newKey, plain)
}

async function rotateByokKeys(oldKey: Buffer, newKey: Buffer) {
  const c: Counters = { scanned: 0, rotated: 0, legacy: 0, alreadyNew: 0, broken: 0 }
  let cursor: string | undefined
  while (true) {
    const batch: Array<{ id: string; byokKey: string | null }> = await prisma.user.findMany({
      where:   { byokKey: { not: null } },
      select:  { id: true, byokKey: true },
      orderBy: { id: 'asc' },
      take:    PAGE_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })
    if (batch.length === 0) break

    for (const u of batch) {
      const next = await rotateValue(u.byokKey, oldKey, newKey, c)
      if (next !== undefined && next !== null) {
        await prisma.user.update({ where: { id: u.id }, data: { byokKey: next } })
      }
    }
    cursor = batch[batch.length - 1].id
    if (batch.length < PAGE_SIZE) break
  }
  console.log(`[byokKey] scanned=${c.scanned} rotated=${c.rotated} legacy_encrypted=${c.legacy} already_on_new=${c.alreadyNew} broken=${c.broken}`)
  return c
}

async function rotateMemoryValues(oldKey: Buffer, newKey: Buffer) {
  const c: Counters = { scanned: 0, rotated: 0, legacy: 0, alreadyNew: 0, broken: 0 }
  let cursor: string | undefined
  while (true) {
    const batch: Array<{ id: string; value: string }> = await prisma.agentMemory.findMany({
      select:  { id: true, value: true },
      orderBy: { id: 'asc' },
      take:    PAGE_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })
    if (batch.length === 0) break

    for (const m of batch) {
      const next = await rotateValue(m.value, oldKey, newKey, c)
      if (next !== undefined && next !== null) {
        await prisma.agentMemory.update({ where: { id: m.id }, data: { value: next } })
      }
    }
    cursor = batch[batch.length - 1].id
    if (batch.length < PAGE_SIZE) break
  }
  console.log(`[agentMemory] scanned=${c.scanned} rotated=${c.rotated} legacy_encrypted=${c.legacy} already_on_new=${c.alreadyNew} broken=${c.broken}`)
  return c
}

async function main() {
  const oldEnv = process.env.ENCRYPTION_KEY_OLD
  const newEnv = process.env.ENCRYPTION_KEY
  if (!oldEnv) throw new Error('ENCRYPTION_KEY_OLD is required')
  if (!newEnv) throw new Error('ENCRYPTION_KEY is required')
  if (oldEnv === newEnv) throw new Error('ENCRYPTION_KEY_OLD and ENCRYPTION_KEY must differ')

  const oldKey = deriveKey(oldEnv)
  const newKey = deriveKey(newEnv)

  console.log('Rotating at-rest encryption key…')
  const byok = await rotateByokKeys(oldKey, newKey)
  const mems = await rotateMemoryValues(oldKey, newKey)

  const totalBroken = byok.broken + mems.broken
  if (totalBroken > 0) {
    console.error(`\n⚠  ${totalBroken} row(s) could not be decrypted with either key.`)
    console.error('   These rows were left untouched. Investigate before proceeding.')
    process.exit(2)
  }
  console.log('\nDone. Update ENCRYPTION_KEY in your platform secrets and redeploy.')
  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error(err)
  await prisma.$disconnect()
  process.exit(1)
})
