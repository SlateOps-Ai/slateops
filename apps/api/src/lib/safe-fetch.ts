import { lookup } from 'node:dns/promises'
import ipaddr from 'ipaddr.js'

/**
 * SSRF guard. Resolves a URL's hostname, validates the scheme and resolved IPs
 * against a deny-list of RFC1918 / loopback / link-local / cloud-metadata / ULA
 * ranges, then returns. Throws if any check fails.
 *
 * Call this BEFORE any server-side fetch of a user-supplied URL — including
 * MCP server attachment, webhook callbacks, avatar/image proxying, RAG ingest.
 *
 * In non-production we allow loopback so local MCP servers work in dev.
 */

const BLOCKED_HOSTS = new Set([
  'metadata.google.internal',
  'metadata.aws.internal',
  'metadata',
])

const BLOCKED_LITERALS = new Set([
  '169.254.169.254',  // AWS / Azure / OpenStack IMDS
  '100.100.100.200',  // Alibaba Cloud
])

function isPrivateRange(ip: ipaddr.IPv4 | ipaddr.IPv6): boolean {
  const range = ip.range()
  // 'unicast' is the only range we accept on the public internet.
  // Everything else (private, loopback, linkLocal, uniqueLocal, multicast,
  // reserved, broadcast, carrierGradeNat, etc.) is blocked.
  return range !== 'unicast'
}

export interface AssertPublicUrlOptions {
  /** Allow loopback addresses (127/8, ::1). Default: only in non-prod. */
  allowLoopback?: boolean
}

export async function assertPublicUrl(rawUrl: string, opts: AssertPublicUrlOptions = {}): Promise<void> {
  let u: URL
  try {
    u = new URL(rawUrl)
  } catch {
    throw new Error('Invalid URL')
  }

  if (!['http:', 'https:'].includes(u.protocol)) {
    throw new Error(`URL scheme not allowed: ${u.protocol}`)
  }

  const host = u.hostname.toLowerCase()
  if (BLOCKED_HOSTS.has(host)) throw new Error('Hostname not allowed')
  if (BLOCKED_LITERALS.has(host)) throw new Error('Address not allowed')

  const allowLoopback = opts.allowLoopback ?? (process.env.NODE_ENV !== 'production')

  // If hostname is already an IP literal, validate directly.
  if (ipaddr.isValid(host)) {
    const ip = ipaddr.parse(host)
    if (BLOCKED_LITERALS.has(ip.toString())) throw new Error('Address not allowed')
    if (isPrivateRange(ip)) {
      if (allowLoopback && ip.range() === 'loopback') return
      throw new Error(`Address in restricted range: ${ip.range()}`)
    }
    return
  }

  // Otherwise resolve DNS and check all returned addresses (DNS rebinding defense).
  const records = await lookup(host, { all: true })
  if (records.length === 0) throw new Error('Hostname did not resolve')

  for (const { address } of records) {
    const ip = ipaddr.parse(address)
    if (BLOCKED_LITERALS.has(ip.toString())) throw new Error('Resolved IP not allowed')
    if (isPrivateRange(ip)) {
      if (allowLoopback && ip.range() === 'loopback') continue
      throw new Error(`Resolved IP in restricted range: ${ip.range()}`)
    }
  }
}
