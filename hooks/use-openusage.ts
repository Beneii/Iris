"use client"

import { useState, useEffect, useCallback, useRef } from "react"

/* ─── Types ─── */

export interface UsageLineProgress {
  type: "progress"
  label: string
  used: number
  limit: number
  format?: string
  resetsAt?: string | null
}

export interface UsageLineText {
  type: "text"
  label: string
  value: string
}

export type UsageLine = UsageLineProgress | UsageLineText

export interface ProviderUsage {
  providerId: string
  displayName: string
  plan?: string | null
  lines: UsageLine[]
  fetchedAt: string
}

interface UsageResponse {
  error: string | null
  providers: ProviderUsage[]
}

/* ─── Electron bridge type ─── */
declare global {
  interface Window {
    electronAPI?: {
      resizeWindow: (deltaWidth: number) => void
      getProviderUsage: () => Promise<UsageResponse>
    }
  }
}

/* ─── Hook ─── */

const POLL_INTERVAL = 30_000 // 30s

export function useProviderUsage() {
  const [providers, setProviders] = useState<ProviderUsage[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isAvailable, setIsAvailable] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchUsage = useCallback(async () => {
    // Only works in Electron (IPC bridge)
    if (!window.electronAPI?.getProviderUsage) {
      setIsAvailable(false)
      setIsLoading(false)
      return
    }

    try {
      const result = await window.electronAPI.getProviderUsage()
      if (result.error) {
        setError(result.error)
        setIsAvailable(false)
        setProviders([])
      } else {
        setProviders(result.providers)
        setIsAvailable(result.providers.length > 0)
        setError(null)
      }
    } catch {
      setIsAvailable(false)
      setProviders([])
      setError("Failed to fetch usage")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUsage()
    intervalRef.current = setInterval(fetchUsage, POLL_INTERVAL)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [fetchUsage])

  return { providers, isLoading, isAvailable, error, refresh: fetchUsage }
}
