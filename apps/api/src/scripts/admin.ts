/**
 * Promote / demote a user to admin, or list everyone's current status.
 *
 * Usage:
 *   pnpm --filter @agentcity/api exec tsx --env-file=.env src/scripts/admin.ts list
 *   pnpm --filter @agentcity/api exec tsx --env-file=.env src/scripts/admin.ts promote <email>
 *   pnpm --filter @agentcity/api exec tsx --env-file=.env src/scripts/admin.ts demote  <email>
 *
 * The User.isAdmin flag gates the /admin dashboard. There's no in-app UI
 * for setting it (audit recommended adding one — deferred). This script
 * is the safe substitute.
 *
 * Email matching is case-insensitive and falls back to clerkId match,
 * which is useful before the Clerk backfill has populated real emails.
 */

import { prisma } from '../lib/prisma.js'

async function findUser(needle: string) {
  return prisma.user.findFirst({
    where: {
      OR: [
        { email:   { equals: needle, mode: 'insensitive' } },
        { clerkId: needle },
      ],
    },
    select: { id: true, email: true, clerkId: true, name: true, plan: true, isAdmin: true },
  })
}

async function listUsers() {
  const users = await prisma.user.findMany({
    orderBy: [{ isAdmin: 'desc' }, { createdAt: 'asc' }],
    select:  { id: true, email: true, clerkId: true, name: true, plan: true, isAdmin: true, createdAt: true },
  })

  console.log(`\nUsers (${users.length}):\n`)
  for (const u of users) {
    const flag = u.isAdmin ? 'ADMIN' : '     '
    console.log(`  ${flag}  ${u.email.padEnd(48)}  plan=${u.plan.padEnd(5)}  clerkId=${u.clerkId}`)
  }
  console.log('')
}

async function setAdmin(needle: string, value: boolean) {
  const user = await findUser(needle)
  if (!user) {
    console.error(`No user matched "${needle}".`)
    process.exit(2)
  }

  if (user.isAdmin === value) {
    console.log(`${user.email} is already ${value ? 'an admin' : 'not an admin'}. No change.`)
    return
  }

  await prisma.user.update({
    where: { id: user.id },
    data:  { isAdmin: value },
  })

  console.log(`${value ? '✓ Promoted' : '✗ Demoted'} ${user.email} (clerkId: ${user.clerkId})`)
}

async function main() {
  const [, , cmd, arg] = process.argv

  switch (cmd) {
    case 'list':
      await listUsers()
      break
    case 'promote':
      if (!arg) { console.error('Usage: admin.ts promote <email>'); process.exit(1) }
      await setAdmin(arg, true)
      break
    case 'demote':
      if (!arg) { console.error('Usage: admin.ts demote <email>'); process.exit(1) }
      await setAdmin(arg, false)
      break
    default:
      console.error('Usage:\n  admin.ts list\n  admin.ts promote <email>\n  admin.ts demote  <email>')
      process.exit(1)
  }

  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error(err)
  await prisma.$disconnect()
  process.exit(1)
})
