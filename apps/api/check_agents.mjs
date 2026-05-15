import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

const runs = await p.workflowRun.findMany({
  where: { workflowId: 'bb2f29a7-d35b-41eb-ba77-9c6f047b9a37' },
  orderBy: { startedAt: 'desc' },
  take: 5,
})
console.log('Runs:', JSON.stringify(runs, null, 2))

await p.$disconnect()
