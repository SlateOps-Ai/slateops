// Catalog of integrations we can OAuth/grant. Shared between API (used to
// validate/suggest) and web (used to render onboarding pre-pick + Connections
// panel). The `composioAppName` is the source of truth for OAuth + tool
// resolution; the rest is presentation.

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
}

export const INTEGRATION_CATALOG: CatalogApp[] = [
  // Communication
  { composioAppName: 'gmail',           label: 'Gmail',            description: 'Read + send email',         category: 'communication', emoji: '📧', toolPrefixes: ['GMAIL'] },
  { composioAppName: 'outlook',         label: 'Outlook',          description: 'Microsoft email',           category: 'communication', emoji: '📨', toolPrefixes: ['OUTLOOK'] },
  { composioAppName: 'slack',           label: 'Slack',            description: 'Post + read messages',      category: 'communication', emoji: '💬', toolPrefixes: ['SLACK'] },
  { composioAppName: 'microsoft_teams', label: 'Microsoft Teams',  description: 'Chat + meetings',           category: 'communication', emoji: '🟣', toolPrefixes: ['MICROSOFT_TEAMS', 'MICROSOFTTEAMS'] },
  // CRM
  { composioAppName: 'salesforce',      label: 'Salesforce',       description: 'CRM contacts + deals',      category: 'crm',           emoji: '☁️', toolPrefixes: ['SALESFORCE'] },
  { composioAppName: 'hubspot',         label: 'HubSpot',          description: 'CRM + marketing',           category: 'crm',           emoji: '🟠', toolPrefixes: ['HUBSPOT'] },
  { composioAppName: 'pipedrive',       label: 'Pipedrive',        description: 'Sales pipeline',            category: 'crm',           emoji: '🔻', toolPrefixes: ['PIPEDRIVE'] },
  { composioAppName: 'zendesk',         label: 'Zendesk',          description: 'Support tickets',           category: 'crm',           emoji: '🎫', toolPrefixes: ['ZENDESK'] },
  { composioAppName: 'intercom',        label: 'Intercom',         description: 'Customer messaging',        category: 'crm',           emoji: '🟢', toolPrefixes: ['INTERCOM'] },
  // Productivity
  { composioAppName: 'google_calendar', label: 'Google Calendar',  description: 'Schedule events',           category: 'productivity',  emoji: '📅', toolPrefixes: ['GOOGLECALENDAR', 'GOOGLE_CALENDAR'] },
  { composioAppName: 'notion',          label: 'Notion',           description: 'Docs + databases',          category: 'productivity',  emoji: '📓', toolPrefixes: ['NOTION'] },
  { composioAppName: 'linear',          label: 'Linear',           description: 'Issue tracking',            category: 'productivity',  emoji: '📐', toolPrefixes: ['LINEAR'] },
  { composioAppName: 'asana',           label: 'Asana',            description: 'Project tasks',             category: 'productivity',  emoji: '🅰️', toolPrefixes: ['ASANA'] },
  { composioAppName: 'trello',          label: 'Trello',           description: 'Boards + cards',            category: 'productivity',  emoji: '📋', toolPrefixes: ['TRELLO'] },
  { composioAppName: 'googledrive',     label: 'Google Drive',     description: 'File storage',              category: 'productivity',  emoji: '💾', toolPrefixes: ['GOOGLEDRIVE', 'GDRIVE'] },
  { composioAppName: 'dropbox',         label: 'Dropbox',          description: 'File storage',              category: 'productivity',  emoji: '📦', toolPrefixes: ['DROPBOX'] },
  // Commerce / Finance / ERP
  { composioAppName: 'shopify',         label: 'Shopify',          description: 'E-commerce store',          category: 'commerce',      emoji: '🛍️', toolPrefixes: ['SHOPIFY'] },
  { composioAppName: 'stripe',          label: 'Stripe',           description: 'Payments + invoices',       category: 'commerce',      emoji: '💳', toolPrefixes: ['STRIPE'] },
  { composioAppName: 'quickbooks',      label: 'QuickBooks',       description: 'Accounting + invoicing',    category: 'finance',       emoji: '📊', toolPrefixes: ['QUICKBOOKS'] },
  { composioAppName: 'xero',            label: 'Xero',             description: 'Accounting',                category: 'finance',       emoji: '🔵', toolPrefixes: ['XERO'] },
  // Social
  { composioAppName: 'linkedin',        label: 'LinkedIn',         description: 'Post + research',           category: 'social',        emoji: '🔗', toolPrefixes: ['LINKEDIN'] },
  { composioAppName: 'twitter',         label: 'Twitter / X',      description: 'Tweets + engagement',       category: 'social',        emoji: '🐦', toolPrefixes: ['TWITTER'] },
  { composioAppName: 'instagram',       label: 'Instagram',        description: 'Publish to feed',           category: 'social',        emoji: '📷', toolPrefixes: ['INSTAGRAM'] },
  { composioAppName: 'facebook',        label: 'Facebook',         description: 'Page posts',                category: 'social',        emoji: '📘', toolPrefixes: ['FACEBOOK'] },
  { composioAppName: 'youtube',         label: 'YouTube',          description: 'Upload + analytics',        category: 'social',        emoji: '▶️', toolPrefixes: ['YOUTUBE'] },
  // Dev
  { composioAppName: 'github',          label: 'GitHub',           description: 'Code + issues + PRs',       category: 'dev',           emoji: '🐙', toolPrefixes: ['GITHUB'] },
  // Data / research
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
  let best: CatalogApp | undefined
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
