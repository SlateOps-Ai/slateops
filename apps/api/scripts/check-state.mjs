import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
try {
  const user = await prisma.user.findFirst({
    select: { email: true, plan: true, onboardingDone: true, settings: true },
    orderBy: { createdAt: 'desc' },
  })
  if (!user) { console.log('No user'); process.exit(1) }
  const raw = user.settings ?? {}
  console.log('Email:', user.email)
  console.log('Plan:', user.plan)
  console.log('onboardingDone:', user.onboardingDone)
  console.log('onboardingIntake present?', !!raw.onboardingIntake)
  if (raw.onboardingIntake) {
    console.log('  composedAgents:', raw.onboardingIntake.composedAgents?.map((a) => `${a.name} (${a.role})`).join(', '))
    console.log('  completedAt:', raw.onboardingIntake.completedAt)
  }
  const agentCount = await prisma.agent.count({ where: { userId: (await prisma.user.findFirst({ where: { email: user.email }, select: { id: true } }))?.id } })
  console.log('Agent count:', agentCount)
} finally {
  await prisma.$disconnect()
}
