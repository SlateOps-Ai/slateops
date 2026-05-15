import { PrismaClient } from '@prisma/client'

const EMAIL = 'user_3Dcgc8eB2ql3XiUihkB3wgpyHQn@clerk'
const prisma = new PrismaClient()

try {
  const before = await prisma.user.findUnique({
    where:  { email: EMAIL },
    select: { id: true, email: true, plan: true, settings: true },
  })
  if (!before) {
    console.error(`User not found: ${EMAIL}`)
    process.exit(1)
  }
  console.log('Before:', { email: before.email, plan: before.plan })

  // Clear onboardingIntake so the takeover fires fresh
  const raw = (before.settings ?? {})
  const nextSettings = { ...raw }
  delete nextSettings.onboardingIntake

  const after = await prisma.user.update({
    where:  { email: EMAIL },
    data:   { plan: 'PRO', settings: nextSettings },
    select: { email: true, plan: true },
  })
  console.log('After: ', after)
  console.log('\nReload your browser tab — the onboarding takeover should fire.')
} finally {
  await prisma.$disconnect()
}
