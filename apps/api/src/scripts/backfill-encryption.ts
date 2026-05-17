/**
 * One-shot backfill that re-encrypts legacy plaintext BYOK keys and agent
 * memory values with the new AES-256-GCM helper.
 *
 * Run once with:
 *   pnpm --filter @agentcity/api exec tsx --env-file=.env src/scripts/backfill-encryption.ts
 *
 * Safe to run multiple times: encrypt() is idempotent on already-tagged values.
 * Reads/writes are paginated so a few million rows won't OOM the process.
 */

import { prisma } from '../lib/prisma.js'
import { encrypt, isEncrypted } from '../lib/crypto.js'

const PAGE_SIZE = 500

async function backfillByokKeys() {
  let scanned = 0
  let encrypted = 0
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
      scanned++
      if (!u.byokKey || isEncrypted(u.byokKey)) continue
      await prisma.user.update({
        where: { id: u.id },
        data:  { byokKey: encrypt(u.byokKey) },
      })
      encrypted++
    }

    cursor = batch[batch.length - 1].id
    if (batch.length < PAGE_SIZE) break
  }

  console.log(`[byokKey] scanned=${scanned} encrypted=${encrypted}`)
}

async function backfillMemoryValues() {
  let scanned = 0
  let encrypted = 0
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
      scanned++
      if (!m.value || isEncrypted(m.value)) continue
      await prisma.agentMemory.update({
        where: { id: m.id },
        data:  { value: encrypt(m.value) },
      })
      encrypted++
    }

    cursor = batch[batch.length - 1].id
    if (batch.length < PAGE_SIZE) break
  }

  console.log(`[agentMemory] scanned=${scanned} encrypted=${encrypted}`)
}

async function main() {
  console.log('Backfilling at-rest encryption…')
  await backfillByokKeys()
  await backfillMemoryValues()
  console.log('Done.')
  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error(err)
  await prisma.$disconnect()
  process.exit(1)
})
