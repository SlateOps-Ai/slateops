export type AgentRole =
  | 'EXEC_ASSISTANT'
  | 'RESEARCH_ANALYST'
  | 'CONTENT_WRITER'
  | 'SALES_PROSPECTOR'
  | 'OPS_COORDINATOR'
  | 'FINANCIAL_ANALYST'
  | 'HR_MANAGER'
  | 'CUSTOMER_SUPPORT'
  | 'DATA_ANALYST'
  | 'MARKETING_STRATEGIST'

export type AgentStatus = 'IDLE' | 'WORKING' | 'BLOCKED' | 'OFFLINE'

export type AvatarStyle = 'PROFESSIONAL' | 'CREATIVE' | 'CASUAL' | 'EXECUTIVE'

export type AvatarPresentation = 'FEMININE' | 'MASCULINE' | 'NEUTRAL'

export interface DeskPosition {
  x: number
  y: number
}

export interface Agent {
  id: string
  officeId: string
  userId: string
  name: string
  role: AgentRole
  avatarUrl: string
  avatarStyle: AvatarStyle
  avatarPresentation: AvatarPresentation
  deskPosition: DeskPosition
  status: AgentStatus
  isActive: boolean
  isPublic: boolean
  createdAt: string
}

export interface CreateAgentInput {
  name: string
  role: AgentRole
  avatarStyle: AvatarStyle
  avatarPresentation: AvatarPresentation
  personality?: string
}

export const AGENT_ROLE_LABELS: Record<AgentRole, string> = {
  EXEC_ASSISTANT:       'Executive Assistant',
  RESEARCH_ANALYST:     'Research Analyst',
  CONTENT_WRITER:       'Content Writer',
  SALES_PROSPECTOR:     'Sales Prospector',
  OPS_COORDINATOR:      'Operations Coordinator',
  FINANCIAL_ANALYST:    'Financial Analyst',
  HR_MANAGER:           'HR Manager',
  CUSTOMER_SUPPORT:     'Customer Support',
  DATA_ANALYST:         'Data Analyst',
  MARKETING_STRATEGIST: 'Marketing Strategist',
}

export const AGENT_ROLE_DESCRIPTIONS: Record<AgentRole, string> = {
  EXEC_ASSISTANT:       'Emails, scheduling, follow-ups, inbox management',
  RESEARCH_ANALYST:     'Competitive intel, summaries, market briefings',
  CONTENT_WRITER:       'Drafts, posts, newsletters, scripts',
  SALES_PROSPECTOR:     'Lead research, outreach drafts, prospect lists',
  OPS_COORDINATOR:      'Task tracking, project summaries, calendar management',
  FINANCIAL_ANALYST:    'Budgets, forecasts, expense reports, financial summaries',
  HR_MANAGER:           'Job descriptions, performance reviews, onboarding docs',
  CUSTOMER_SUPPORT:     'Ticket responses, FAQs, customer communication drafts',
  DATA_ANALYST:         'Data summaries, trend analysis, metric reports',
  MARKETING_STRATEGIST: 'Campaign planning, brand messaging, ad copy, market analysis',
}

export const GIFT_TASKS: Record<AgentRole, { withIntegration: string; withoutIntegration: string }> = {
  EXEC_ASSISTANT: {
    withIntegration:    'Summarise my 5 most recent emails and flag anything urgent.',
    withoutIntegration: 'Draft a professional weekly status update template I can send to my team.',
  },
  RESEARCH_ANALYST: {
    withIntegration:    'Research my company and write a 1-paragraph competitive position overview.',
    withoutIntegration: 'Research the top 5 AI automation tools and write a one-paragraph comparison.',
  },
  CONTENT_WRITER: {
    withIntegration:    'Write 3 LinkedIn post ideas based on building an AI-powered team.',
    withoutIntegration: 'Write 3 LinkedIn post ideas based on building an AI-powered team.',
  },
  SALES_PROSPECTOR: {
    withIntegration:    'Find 5 companies that could benefit from AI workflow automation and write a one-line pitch for each.',
    withoutIntegration: 'Find 5 companies that could benefit from AI workflow automation and write a one-line pitch for each.',
  },
  OPS_COORDINATOR: {
    withIntegration:    'List my meetings for the next 5 days and flag any scheduling conflicts.',
    withoutIntegration: 'Create a weekly planning template for a founder managing a 3-person startup.',
  },
  FINANCIAL_ANALYST: {
    withIntegration:    'Summarise this month\'s expenses and flag any items over budget.',
    withoutIntegration: 'Build a monthly budget tracking template for a 10-person startup.',
  },
  HR_MANAGER: {
    withIntegration:    'Draft a job description for a senior software engineer role at our company.',
    withoutIntegration: 'Write a 30-60-90 day onboarding plan for a new marketing hire.',
  },
  CUSTOMER_SUPPORT: {
    withIntegration:    'Draft a polite response to a customer asking for a refund after missing the deadline.',
    withoutIntegration: 'Write an FAQ covering the 5 most common SaaS customer support questions.',
  },
  DATA_ANALYST: {
    withIntegration:    'Summarise last month\'s key performance metrics and highlight any anomalies.',
    withoutIntegration: 'Write a data analysis report template for weekly business metrics.',
  },
  MARKETING_STRATEGIST: {
    withIntegration:    'Draft a 4-week content calendar for our product launch campaign.',
    withoutIntegration: 'Write 5 ad copy variations for a B2B SaaS targeting operations teams.',
  },
}
