import { getComposioClient } from '../lib/composio.js'
import { prisma } from '../lib/prisma.js'

export type PublishResult = {
  platform: string
  success:  boolean
  postId?:  string
  url?:     string
  error?:   string
}

function buildPlatformParams(platform: string, content: string): Record<string, unknown> {
  switch (platform) {
    case 'TWITTER':   return { text: content }
    case 'LINKEDIN':  return { text: content, visibility: 'PUBLIC' }
    case 'INSTAGRAM': return { caption: content }
    case 'FACEBOOK':  return { message: content }
    case 'YOUTUBE':   return { title: content.slice(0, 100), description: content }
    case 'TIKTOK':    return { description: content }
    case 'THREADS':   return { text: content }
    case 'PINTEREST': return { description: content, board_id: 'default' }
    default:          return { text: content }
  }
}

const PLATFORM_ACTION: Record<string, string> = {
  TWITTER:   'TWITTER_CREATE_TWEET',
  LINKEDIN:  'LINKEDIN_CREATE_POST',
  INSTAGRAM: 'INSTAGRAM_CREATE_MEDIA_PUBLISH',
  FACEBOOK:  'FACEBOOK_CREATE_POST',
  YOUTUBE:   'YOUTUBE_UPLOAD_VIDEO',
  TIKTOK:    'TIKTOK_UPLOAD_VIDEO',
  THREADS:   'THREADS_CREATE_POST',
  PINTEREST: 'PINTEREST_CREATE_PIN',
}

export async function publishPost(
  userId: string,
  platforms: string[],
  content: string,
  _mediaUrls: string[] = [],
): Promise<PublishResult[]> {
  const composio = getComposioClient()
  const results: PublishResult[] = []

  for (const platform of platforms) {
    const action = PLATFORM_ACTION[platform.toUpperCase()]
    if (!action) {
      results.push({ platform, success: false, error: `Unsupported platform: ${platform}` })
      continue
    }

    try {
      const params: Record<string, unknown> = buildPlatformParams(platform.toUpperCase(), content)

      const result = await composio.tools.execute(action, {
        userId,
        arguments: params,
      })

      if ((result as any)?.successful === false) {
        results.push({
          platform,
          success: false,
          error:   (result as any).error ?? (result as any).errorMessage ?? 'Action failed',
        })
      } else {
        const data = (result as any)?.data ?? result
        results.push({
          platform,
          success: true,
          postId:  data?.id ?? data?.post_id,
          url:     data?.url ?? data?.permalink,
        })
      }
    } catch (err) {
      results.push({ platform, success: false, error: (err as Error).message ?? 'Unknown error' })
    }
  }

  return results
}

export type SocialAccountInfo = {
  connected:   boolean
  handle?:     string
  displayName?: string
}

export async function getConnectionStatus(
  userId: string,
  platforms: string[],
): Promise<Record<string, SocialAccountInfo>> {
  try {
    const composio = getComposioClient()
    const accounts = await composio.connectedAccounts.list({ userIds: [userId] } as any)

    const byApp = new Map<string, any>()
    for (const a of accounts.items as any[]) {
      const key = (a.toolkit?.slug ?? a.appName ?? a.app_name ?? '').toString().toUpperCase()
      if (key && (a.status === 'ACTIVE' || a.status === 'active')) byApp.set(key, a)
    }

    return Object.fromEntries(
      platforms.map((p) => {
        const acct = byApp.get(p.toUpperCase())
        if (!acct) return [p, { connected: false }]
        const meta   = acct.state?.val ?? acct.connectionData?.val ?? acct.metadata ?? {}
        const handle = meta.username ?? meta.screen_name ?? meta.handle ?? meta.login ?? meta.email ?? null
        const display = meta.name ?? meta.displayName ?? meta.full_name ?? handle ?? null
        return [p, { connected: true, handle: handle ?? undefined, displayName: display ?? undefined }]
      }),
    )
  } catch {
    return Object.fromEntries(platforms.map((p) => [p, { connected: false }]))
  }
}

// Composio-specific app name for each platform
export const COMPOSIO_APP_NAME: Record<string, string> = {
  TWITTER:   'twitter',
  LINKEDIN:  'linkedin',
  INSTAGRAM: 'instagram',
  FACEBOOK:  'facebook',
  YOUTUBE:   'youtube',
  TIKTOK:    'tiktok',
  THREADS:   'threads',
  PINTEREST: 'pinterest',
}

export async function getOAuthUrl(userId: string, platform: string, webUrl: string): Promise<string> {
  const appName  = COMPOSIO_APP_NAME[platform.toUpperCase()] ?? platform.toLowerCase()
  const composio = getComposioClient()
  // Find the Composio-managed Auth Config for this toolkit
  const authConfigs = await composio.authConfigs.list({ toolkit: appName })
  const active = authConfigs.items.find((c: any) => c.enabled !== false)
  if (!active) throw new Error(`No Auth Config set up for "${appName}" — add it in the Composio dashboard (Toolkits → ${appName} → + Add to Project).`)

  const conn = await composio.connectedAccounts.link(userId, active.id, {
    callbackUrl:   `${webUrl}/office?socialConnected=${platform.toLowerCase()}`,
    allowMultiple: true,
  } as any)
  if (!conn.redirectUrl) throw new Error(`Could not generate OAuth URL for ${platform}`)
  return conn.redirectUrl
}

// Background job: publish all due scheduled posts
export async function publishDuePosts(): Promise<void> {
  const now = new Date()
  const due = await prisma.scheduledPost.findMany({
    where:  { status: 'SCHEDULED', scheduledAt: { lte: now } },
    take:   20,
    select: { id: true, userId: true, platforms: true, content: true, mediaUrls: true },
  })
  if (due.length === 0) return

  await Promise.all(
    due.map(async (post) => {
      await prisma.scheduledPost.update({ where: { id: post.id }, data: { status: 'PUBLISHING' } })
      try {
        const results = await publishPost(post.userId, post.platforms, post.content, post.mediaUrls)
        const anySuccess = results.some((r) => r.success)
        await prisma.scheduledPost.update({
          where: { id: post.id },
          data:  {
            status:      anySuccess ? 'PUBLISHED' : 'FAILED',
            publishedAt: anySuccess ? now : undefined,
            failReason:  anySuccess
              ? null
              : results.map((r) => `${r.platform}: ${r.error}`).join('; '),
            results: results as any,
          },
        })
      } catch (err) {
        await prisma.scheduledPost.update({
          where: { id: post.id },
          data:  { status: 'FAILED', failReason: (err as Error).message ?? 'Unknown error' },
        })
      }
    }),
  )
}
