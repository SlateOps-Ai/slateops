'use client'

import { useAuth } from '@clerk/nextjs'
import { useCallback } from 'react'

export function useAuthFetch() {
  const { getToken } = useAuth()

  return useCallback(async (url: string, options: RequestInit = {}) => {
    const token = await getToken()
    const headers: Record<string, string> = {}
    if (token) headers['Authorization'] = `Bearer ${token}`
    if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json'
    return fetch(url, {
      ...options,
      headers: { ...headers, ...(options.headers as Record<string, string> ?? {}) },
    })
  }, [getToken])
}
