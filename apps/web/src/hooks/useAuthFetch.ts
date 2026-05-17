'use client'

import { useAuth } from '@clerk/nextjs'
import { useCallback } from 'react'

/**
 * authFetch — fetch with a Clerk-issued Bearer token attached.
 *
 * Why the timeout: in some session-loading edge cases Clerk's `getToken()`
 * can hang. Without a guard, every authenticated fetch silently waits
 * forever and the UI sits on "Loading…" with no error to debug. The 4s
 * race here lets us fire the request anyway (which the API will 401) so
 * the existing error-banner path runs and the user knows their session is
 * broken instead of staring at a blank page.
 *
 * Every fetch is logged to the browser console so the user can confirm
 * the request was attempted at all — the single most common source of
 * "the page never loads" reports in dev was Clerk getToken hanging.
 */
export function useAuthFetch() {
  const { getToken, isLoaded, isSignedIn } = useAuth()

  return useCallback(async (url: string, options: RequestInit = {}) => {
    let token: string | null = null
    try {
      token = await Promise.race([
        getToken(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 4_000)),
      ])
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[authFetch] getToken threw', err)
    }

    if (!token) {
      // eslint-disable-next-line no-console
      console.warn(
        '[authFetch] no Clerk token (isLoaded=%s, isSignedIn=%s) — firing anyway',
        isLoaded, isSignedIn,
      )
    }

    const headers: Record<string, string> = {}
    if (token) headers['Authorization'] = `Bearer ${token}`
    if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json'

    // eslint-disable-next-line no-console
    console.debug('[authFetch] →', options.method ?? 'GET', url, token ? '(authed)' : '(NO TOKEN)')
    return fetch(url, {
      ...options,
      headers: { ...headers, ...(options.headers as Record<string, string> ?? {}) },
    })
  }, [getToken, isLoaded, isSignedIn])
}
