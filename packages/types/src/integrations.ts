import type { AgentRole } from './agents'

// Catalog of integrations we can OAuth/grant. Shared between API (used to
// validate/suggest) and web (used to render onboarding pre-pick + Connections
// panel). The `composioAppName` is the source of truth for OAuth + tool
// resolution; the rest is presentation.
//
// `roles?` is a *recommendation* — apps without it are universal (Gmail,
// Calendar, etc. are useful to anyone). Apps with it appear de-emphasised
// for non-matching roles in the UI; power users can still override from the
// Connections panel matrix. The drag-to-grant shelf, being the friendly
// path, politely refuses off-role drops.

export type IntegrationCategory =
  | 'communication'
  | 'crm'
  | 'productivity'
  | 'commerce'
  | 'finance'
  | 'dev'
  | 'social'
  | 'data'

export interface CatalogApp {
  composioAppName: string
  label:           string
  description:     string
  category:        IntegrationCategory
  emoji:           string
  /** Prefix(es) on Composio action names that route to this app. */
  toolPrefixes:    string[]
  /**
   * Roles this app is meaningfully useful to. Omit for universal apps
   * (everyone might use Gmail). Restrict for specialised apps (Salesforce
   * is mostly for sales / support / exec / marketing roles).
   */
  roles?: AgentRole[]
}

// Helper sets — keep these in sync with the role bands below.
const COMM_ROLES: AgentRole[] = [
  'EXEC_ASSISTANT', 'CUSTOMER_SUPPORT', 'SALES_PROSPECTOR',
  'MARKETING_STRATEGIST', 'HR_MANAGER', 'OPS_COORDINATOR',
]
const CRM_ROLES: AgentRole[] = [
  'SALES_PROSPECTOR', 'CUSTOMER_SUPPORT', 'MARKETING_STRATEGIST', 'EXEC_ASSISTANT',
]
const SUPPORT_ROLES: AgentRole[] = ['CUSTOMER_SUPPORT', 'EXEC_ASSISTANT']
const FINANCE_ROLES: AgentRole[] = ['FINANCIAL_ANALYST', 'OPS_COORDINATOR']
const COMMERCE_ROLES: AgentRole[] = [
  'MARKETING_STRATEGIST', 'OPS_COORDINATOR', 'FINANCIAL_ANALYST', 'CUSTOMER_SUPPORT',
]
const PAYMENTS_ROLES: AgentRole[] = [
  'FINANCIAL_ANALYST', 'OPS_COORDINATOR', 'SALES_PROSPECTOR',
]
const SOCIAL_PUBLISH_ROLES: AgentRole[] = ['CONTENT_WRITER', 'MARKETING_STRATEGIST']
const SOCIAL_BROAD_ROLES: AgentRole[] = [
  'CONTENT_WRITER', 'MARKETING_STRATEGIST', 'SALES_PROSPECTOR',
]
const DEV_ROLES: AgentRole[] = [
  'RESEARCH_ANALYST', 'DATA_ANALYST', 'OPS_COORDINATOR',
]

export const INTEGRATION_CATALOG: CatalogApp[] = [
  // ── Communication (mostly universal) ────────────────────────────────────
  { composioAppName: 'gmail',           label: 'Gmail',            description: 'Read + send email',         category: 'communication', emoji: '📧', toolPrefixes: ['GMAIL'] },
  { composioAppName: 'outlook',         label: 'Outlook',          description: 'Microsoft email',           category: 'communication', emoji: '📨', toolPrefixes: ['OUTLOOK'] },
  { composioAppName: 'slack',           label: 'Slack',            description: 'Post + read messages',      category: 'communication', emoji: '💬', toolPrefixes: ['SLACK'] },
  { composioAppName: 'microsoft_teams', label: 'Microsoft Teams',  description: 'Chat + meetings',           category: 'communication', emoji: '🟣', toolPrefixes: ['MICROSOFT_TEAMS', 'MICROSOFTTEAMS'] },
  { composioAppName: 'whatsapp',        label: 'WhatsApp',         description: 'Customer + sales messaging',category: 'communication', emoji: '🟢', toolPrefixes: ['WHATSAPP'], roles: COMM_ROLES },

  // ── CRM ─────────────────────────────────────────────────────────────────
  { composioAppName: 'salesforce',      label: 'Salesforce',       description: 'CRM contacts + deals',      category: 'crm',           emoji: '☁️', toolPrefixes: ['SALESFORCE'],     roles: CRM_ROLES },
  { composioAppName: 'hubspot',         label: 'HubSpot',          description: 'CRM + marketing',           category: 'crm',           emoji: '🟠', toolPrefixes: ['HUBSPOT'],        roles: CRM_ROLES },
  { composioAppName: 'pipedrive',       label: 'Pipedrive',        description: 'Sales pipeline',            category: 'crm',           emoji: '🔻', toolPrefixes: ['PIPEDRIVE'],      roles: CRM_ROLES },
  { composioAppName: 'zendesk',         label: 'Zendesk',          description: 'Support tickets',           category: 'crm',           emoji: '🎫', toolPrefixes: ['ZENDESK'],        roles: SUPPORT_ROLES },
  { composioAppName: 'intercom',        label: 'Intercom',         description: 'Customer messaging',        category: 'crm',           emoji: '🟢', toolPrefixes: ['INTERCOM'],       roles: SUPPORT_ROLES },

  // ── Productivity (mostly universal) ─────────────────────────────────────
  { composioAppName: 'google_calendar', label: 'Google Calendar',  description: 'Schedule events',           category: 'productivity',  emoji: '📅', toolPrefixes: ['GOOGLECALENDAR', 'GOOGLE_CALENDAR'] },
  { composioAppName: 'notion',          label: 'Notion',           description: 'Docs + databases',          category: 'productivity',  emoji: '📓', toolPrefixes: ['NOTION'] },
  { composioAppName: 'linear',          label: 'Linear',           description: 'Issue tracking',            category: 'productivity',  emoji: '📐', toolPrefixes: ['LINEAR'],          roles: DEV_ROLES },
  { composioAppName: 'asana',           label: 'Asana',            description: 'Project tasks',             category: 'productivity',  emoji: '🅰️', toolPrefixes: ['ASANA'] },
  { composioAppName: 'trello',          label: 'Trello',           description: 'Boards + cards',            category: 'productivity',  emoji: '📋', toolPrefixes: ['TRELLO'] },
  { composioAppName: 'googledrive',     label: 'Google Drive',     description: 'File storage',              category: 'productivity',  emoji: '💾', toolPrefixes: ['GOOGLEDRIVE', 'GDRIVE'] },
  { composioAppName: 'dropbox',         label: 'Dropbox',          description: 'File storage',              category: 'productivity',  emoji: '📦', toolPrefixes: ['DROPBOX'] },

  // ── Commerce / Finance ──────────────────────────────────────────────────
  { composioAppName: 'shopify',         label: 'Shopify',          description: 'E-commerce store',          category: 'commerce',      emoji: '🛍️', toolPrefixes: ['SHOPIFY'],         roles: COMMERCE_ROLES },
  { composioAppName: 'stripe',          label: 'Stripe',           description: 'Payments + invoices',       category: 'commerce',      emoji: '💳', toolPrefixes: ['STRIPE'],          roles: PAYMENTS_ROLES },
  { composioAppName: 'quickbooks',      label: 'QuickBooks',       description: 'Accounting + invoicing',    category: 'finance',       emoji: '📊', toolPrefixes: ['QUICKBOOKS'],      roles: FINANCE_ROLES },
  { composioAppName: 'xero',            label: 'Xero',             description: 'Accounting',                category: 'finance',       emoji: '🔵', toolPrefixes: ['XERO'],            roles: FINANCE_ROLES },

  // ── Social ──────────────────────────────────────────────────────────────
  { composioAppName: 'linkedin',        label: 'LinkedIn',         description: 'Post + research',           category: 'social',        emoji: '🔗', toolPrefixes: ['LINKEDIN'],        roles: SOCIAL_BROAD_ROLES },
  { composioAppName: 'twitter',         label: 'Twitter / X',      description: 'Tweets + engagement',       category: 'social',        emoji: '🐦', toolPrefixes: ['TWITTER'],         roles: SOCIAL_PUBLISH_ROLES },
  { composioAppName: 'instagram',       label: 'Instagram',        description: 'Publish to feed',           category: 'social',        emoji: '📷', toolPrefixes: ['INSTAGRAM'],       roles: SOCIAL_PUBLISH_ROLES },
  { composioAppName: 'facebook',        label: 'Facebook',         description: 'Page posts',                category: 'social',        emoji: '📘', toolPrefixes: ['FACEBOOK'],        roles: SOCIAL_PUBLISH_ROLES },
  { composioAppName: 'youtube',         label: 'YouTube',          description: 'Upload + analytics',        category: 'social',        emoji: '▶️', toolPrefixes: ['YOUTUBE'],         roles: SOCIAL_PUBLISH_ROLES },

  // ── Dev ─────────────────────────────────────────────────────────────────
  { composioAppName: 'github',          label: 'GitHub',           description: 'Code + issues + PRs',       category: 'dev',           emoji: '🐙', toolPrefixes: ['GITHUB'],          roles: DEV_ROLES },

  // ── Data / research (universal — any agent might need to look something up) ─
  { composioAppName: 'serpapi',         label: 'Web Search',       description: 'Search the web',            category: 'data',          emoji: '🔍', toolPrefixes: ['SERPAPI'] },
  { composioAppName: 'browserbase',     label: 'Web Scrape',       description: 'Read any public webpage',   category: 'data',          emoji: '🕸️', toolPrefixes: ['BROWSERBASE'] },
]

/** Look up a catalog entry by Composio app name (case-insensitive). */
export function findCatalogApp(composioAppName: string): CatalogApp | undefined {
  const n = composioAppName.toLowerCase()
  return INTEGRATION_CATALOG.find((a) => a.composioAppName === n)
}

/** Map a Composio action/tool name (e.g. "GMAIL_SEND_EMAIL") to its app entry. */
export function appForToolName(toolName: string): CatalogApp | undefined {
  // Try the longest matching prefix first so 'GOOGLE_CALENDAR' beats 'GOOGLE'
  const upper = toolName.toUpperCase()
  let best:    CatalogApp | undefined
  let bestLen = 0
  for (const app of INTEGRATION_CATALOG) {
    for (const prefix of app.toolPrefixes) {
      if (upper.startsWith(prefix + '_') && prefix.length > bestLen) {
        best    = app
        bestLen = prefix.length
      }
    }
  }
  return best
}

/** Is this app a sensible default for this role? */
export function canRoleUseApp(role: AgentRole, app: CatalogApp): boolean {
  if (!app.roles || app.roles.length === 0) return true
  return app.roles.includes(role)
}

/** All catalog apps that would be suggested for this role. */
export function appsForRole(role: AgentRole): CatalogApp[] {
  return INTEGRATION_CATALOG.filter((a) => canRoleUseApp(role, a))
}

/** Union of apps useful to any role in the given set. Empty input = full catalog. */
export function appsForRoles(roles: AgentRole[]): CatalogApp[] {
  if (roles.length === 0) return [...INTEGRATION_CATALOG]
  return INTEGRATION_CATALOG.filter((a) => roles.some((r) => canRoleUseApp(r, a)))
}
