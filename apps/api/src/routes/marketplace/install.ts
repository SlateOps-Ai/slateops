import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'

const TEMPLATES: Record<string, { name: string; role: string; prompt: string; memory: string[] }> = {
  'seo-writer':       { name: 'SEO Content Writer',     role: 'CONTENT_WRITER',      prompt: 'You are an expert SEO content writer. Always research keywords before writing, include meta descriptions, use proper heading hierarchy, and write for both humans and search engines.', memory: ['Preferred tone: professional but approachable', 'Always include a CTA', 'Target 1500-2000 words for blog posts'] },
  'sales-hunter':     { name: 'Sales Prospector Pro',   role: 'SALES_PROSPECTOR',    prompt: 'You are a top-performing sales development rep. Research prospects thoroughly before outreach, personalise every message, and focus on value over features.', memory: ['ICP: B2B SaaS companies 50-500 employees', 'Avoid generic templates', 'Follow up max 3 times'] },
  'financial-monitor':{ name: 'Financial Analyst',      role: 'FINANCIAL_ANALYST',   prompt: 'You are a senior financial analyst. Create clear, accurate financial reports. Flag anomalies immediately. Always provide context and recommendations alongside raw numbers.', memory: ['Report format: executive summary first', 'Flag anything >10% variance', 'Use USD unless specified'] },
  'customer-success': { name: 'Customer Success Agent', role: 'CUSTOMER_SUPPORT',    prompt: 'You are a customer success specialist. Always acknowledge feelings before solving problems. Be empathetic, solutions-oriented, and proactive about preventing future issues.', memory: ['Tone: warm and professional', 'Escalate billing disputes to human', 'SLA: respond within 2 hours'] },
  'research-deep':    { name: 'Deep Research Analyst',  role: 'RESEARCH_ANALYST',    prompt: 'You are a meticulous research analyst. Always cite sources, present multiple viewpoints, and provide executive summaries with detailed appendices.', memory: ['Preferred format: summary → data → sources', 'Minimum 5 sources per report', 'Flag low-confidence findings'] },
  'social-media':     { name: 'Social Media Manager',   role: 'MARKETING_STRATEGIST',prompt: 'You are a social media expert. Adapt tone and format for each platform. Twitter/X is punchy, LinkedIn is professional, Instagram is visual.', memory: ['Brand voice: confident and human', 'Post frequency: daily on X, 3x/week LinkedIn', 'Avoid corporate jargon'] },
}

const AVATAR_URLS: Record<string, string> = {
  'seo-writer':        'https://api.dicebear.com/7.x/avataaars/svg?seed=seo-writer&backgroundColor=b6e3f4',
  'sales-hunter':      'https://api.dicebear.com/7.x/avataaars/svg?seed=sales-hunter&backgroundColor=ffd5dc',
  'financial-monitor': 'https://api.dicebear.com/7.x/avataaars/svg?seed=financial&backgroundColor=c0aede',
  'customer-success':  'https://api.dicebear.com/7.x/avataaars/svg?seed=customer-success&backgroundColor=d1f4e0',
  'research-deep':     'https://api.dicebear.com/7.x/avataaars/svg?seed=research&backgroundColor=ffecd2',
  'social-media':      'https://api.dicebear.com/7.x/avataaars/svg?seed=social-media&backgroundColor=f9c6ff',
}

export default async function marketplaceInstallRoute(app: FastifyInstance) {
  app.post('/api/marketplace/install', async (req, reply) => {
    const userId = req.dbUserId
    const { templateId } = z.object({ templateId: z.string() }).parse(req.body)

    const template = TEMPLATES[templateId]
    if (!template) return reply.code(404).send({ error: 'Template not found' })

    const [agentCount, office] = await Promise.all([
      prisma.agent.count({ where: { userId } }),
      prisma.office.findUnique({ where: { userId } }),
    ])
    if (agentCount >= 6) return reply.code(400).send({ error: 'Maximum 6 agents reached. Delete one to add more.' })
    if (!office) return reply.code(404).send({ error: 'Office not found' })

    const DESK_POSITIONS = [
      { x: 272, y: 388 }, { x: 412, y: 388 }, { x: 342, y: 525 },
      { x: 855, y: 388 }, { x: 995, y: 388 }, { x: 925, y: 525 },
    ]

    const agent = await prisma.agent.create({
      data: {
        officeId:           office.id,
        userId,
        name:               template.name,
        role:               template.role as any,
        systemPrompt:       template.prompt,
        avatarUrl:          AVATAR_URLS[templateId] ?? `https://api.dicebear.com/7.x/avataaars/svg?seed=${templateId}`,
        avatarStyle:        'PROFESSIONAL',
        avatarPresentation: 'NEUTRAL',
        deskPosition:       DESK_POSITIONS[agentCount % DESK_POSITIONS.length],
        status:             'IDLE',
        isActive:           true,
        isPublic:           false,
      },
    })

    // Seed initial memory entries
    if (template.memory.length > 0) {
      const { encrypt } = await import('../../lib/crypto.js')
      await prisma.agentMemory.createMany({
        data: template.memory.map((value, i) => ({
          agentId:    agent.id,
          key:        `starter_${i}`,
          value:      encrypt(value),
          memoryType: 'LONG_TERM',
          source:     'MANUAL',
        })),
      })
    }

    return reply.code(201).send({ agent })
  })
}
