import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

try {
  const user = await prisma.user.findFirst({ orderBy: { createdAt: 'desc' }, select: { id: true, email: true, plan: true, settings: true } })
  if (!user) { console.error('No user'); process.exit(1) }

  const raw = user.settings ?? {}
  const nextSettings = { ...raw }
  delete nextSettings.onboardingIntake

  // Delete agents (and their dependencies) — clean slate for testing the takeover flow.
  const deletedTasks   = await prisma.task.deleteMany({       where: { userId: user.id } })
  const deletedMems    = await prisma.agentMemory.deleteMany({ where: { agent: { userId: user.id } } })
  const deletedAgents  = await prisma.agent.deleteMany({      where: { userId: user.id } })

  await prisma.user.update({
    where: { id: user.id },
    data:  { plan: 'PRO', onboardingDone: false, settings: nextSettings },
  })

  console.log(`Reset complete for ${user.email}`)
  console.log(`  Plan: PRO  onboardingDone: false  onboardingIntake: cleared`)
  console.log(`  Deleted: ${deletedAgents.count} agents, ${deletedMems.count} memories, ${deletedTasks.count} tasks`)
  console.log(`\nReload your browser — takeover should fire.`)
} finally {
  await prisma.$disconnect()
}
