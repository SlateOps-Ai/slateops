import fp from 'fastify-plugin'
import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '../../lib/prisma.js'

const ai = new Anthropic()

export default fp(async (app) => {
  // GET autonomous config + objectives
  app.get('/api/autonomous', async (req: any, reply) => {
    const userId = req.userId

    let config = await prisma.autonomousConfig.findUnique({ where: { userId } })
    if (!config) {
      config = await prisma.autonomousConfig.create({ data: { userId } })
    }
    const objectives = await prisma.businessObjective.findMany({
      where: { userId, isActive: true },
      orderBy: { createdAt: 'desc' },
    })
    return reply.send({ config, objectives })
  })

  // PATCH toggle autonomous mode or update brief time
  app.patch('/api/autonomous', async (req: any, reply) => {
    const userId = req.userId
    const { enabled, briefTime } = req.body as { enabled?: boolean; briefTime?: string }

    const config = await prisma.autonomousConfig.upsert({
      where: { userId },
      create: { userId, enabled: enabled ?? false, briefTime: briefTime ?? '08:00' },
      update: { ...(enabled !== undefined ? { enabled } : {}), ...(briefTime ? { briefTime } : {}) },
    })
    return reply.send({ config })
  })

  // POST create an objective
  app.post('/api/autonomous/objectives', async (req: any, reply) => {
    const userId = req.userId
    const { title, description, metric, targetValue, period = 'monthly', dueAt } =
      req.body as { title: string; description?: string; metric: string; targetValue: number; period?: string; dueAt: string }

    const obj = await prisma.businessObjective.create({
      data: { userId, title, description, metric, targetValue, period, dueAt: new Date(dueAt) },
    })
    return reply.code(201).send({ objective: obj })
  })

  // PATCH update objective progress
  app.patch('/api/autonomous/objectives/:id', async (req: any, reply) => {
    const { id } = req.params as { id: string }
    const userId = req.userId
    const { currentValue, isActive } = req.body as { currentValue?: number; isActive?: boolean }

    const obj = await prisma.businessObjective.updateMany({
      where: { id, userId },
      data: { ...(currentValue !== undefined ? { currentValue } : {}), ...(isActive !== undefined ? { isActive } : {}) },
    })
    return reply.send({ updated: obj.count })
  })

  // DELETE objective
  app.delete('/api/autonomous/objectives/:id', async (req: any, reply) => {
    const { id } = req.params as { id: string }
    const userId = req.userId
    await prisma.businessObjective.deleteMany({ where: { id, userId } })
    return reply.send({ ok: true })
  })

  // GET morning brief (AI-generated from recent activity)
  app.get('/api/autonomous/brief', async (req: any, reply) => {
    const userId = req.userId

    const [recentTasks, objectives, agents, brainNodes] = await Promise.all([
      prisma.task.findMany({
        where: { userId, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        include: { agent: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      prisma.businessObjective.findMany({ where: { userId, isActive: true } }),
      prisma.agent.findMany({ where: { userId }, select: { name: true, status: true, role: true } }),
      prisma.brainNode.findMany({ where: { userId }, orderBy: { importance: 'desc' }, take: 10 }),
    ])

    const context = [
      `Agents: ${agents.map((a) => `${a.name} (${a.status})`).join(', ')}`,
      `Recent tasks (24h): ${recentTasks.map((t) => `${t.title} [${t.status}] by ${t.agent.name}`).join('; ')}`,
      `Active objectives: ${objectives.map((o) => `${o.title}: ${o.currentValue}/${o.targetValue} ${o.metric}`).join('; ')}`,
      `Key insights: ${brainNodes.slice(0, 5).map((n) => n.topic).join(', ')}`,
    ].join('\n')

    try {
      const { callAnthropic } = await import('../../lib/llm-usage.js')
      const msg = await callAnthropic(ai, {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 700,
        messages: [{
          role: 'user',
          content: `You are the Chief of Staff for an AI-powered office. Generate a concise morning brief (3–5 bullet points) covering: yesterday's wins, today's priorities, any risks or blockers, and one strategic recommendation. Be actionable and direct. Format as JSON: {"headline":"…","bullets":[{"type":"win|priority|risk|strategy","text":"…"}],"date":"${new Date().toDateString()}"}\n\nOffice status:\n${context}`,
        }],
      }, { userId, endpoint: '/api/autonomous/morning-brief' })

      const raw = (msg.content[0] as any).text.trim()
      const brief = JSON.parse(raw.replace(/```json|```/g, '').trim())

      await prisma.autonomousConfig.updateMany({ where: { userId }, data: { lastBriefAt: new Date() } })

      return reply.send({ brief })
    } catch {
      return reply.send({
        brief: {
          headline: 'Office status nominal',
          bullets: [
            { type: 'priority', text: 'Review your active objectives and assign tasks to your agents.' },
            { type: 'strategy', text: 'Enable Autonomous Mode to let your office self-organize.' },
          ],
          date: new Date().toDateString(),
        },
      })
    }
  })

  // POST trigger autonomous planning run (agents self-assign tasks toward objectives)
  app.post('/api/autonomous/run', async (req: any, reply) => {
    const userId = req.userId

    const [agents, objectives] = await Promise.all([
      prisma.agent.findMany({ where: { userId, isActive: true, status: 'IDLE' }, take: 5 }),
      prisma.businessObjective.findMany({ where: { userId, isActive: true } }),
    ])

    if (!agents.length || !objectives.length) {
      return reply.send({ dispatched: [], message: 'No idle agents or active objectives.' })
    }

    const agentList = agents.map((a) => `${a.name} (${a.role})`).join(', ')
    const objList = objectives.map((o) => `${o.title}: reach ${o.targetValue} ${o.metric} by ${o.dueAt.toDateString()}`).join('; ')

    try {
      const { callAnthropic } = await import('../../lib/llm-usage.js')
      const msg = await callAnthropic(ai, {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: `You are an autonomous office director. Assign ONE specific task to each agent to progress toward the business objectives. Return JSON array: [{"agentId":"…","agentName":"…","task":"…"}]. Use exactly these agents.\n\nAgents: ${agentList}\nObjectives: ${objList}\n\nAgent IDs: ${agents.map((a) => `${a.name}:${a.id}`).join(', ')}`,
        }],
      }, { userId, endpoint: '/api/autonomous/run' })

      const raw = (msg.content[0] as any).text.trim()
      const assignments = JSON.parse(raw.replace(/```json|```/g, '').trim())

      return reply.send({ dispatched: Array.isArray(assignments) ? assignments : [], message: 'Autonomous run complete.' })
    } catch {
      return reply.send({ dispatched: [], message: 'Planning failed.' })
    }
  })
})
