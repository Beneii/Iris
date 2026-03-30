"use client"

import { useState, useEffect, useCallback, useRef } from "react"

/* ─── Types matching OpenUsage local HTTP API ─── */

export interface UsageLineProgress {
  type: "progress"
  label: string
  used: number
  limit: number
  format: { kind: "percent" | "number" | "currency" | "tokens" }
  resetsAt?: string
  periodDurationMs?: number
  color?: string | null
}

export interface UsageLineText {
  type: "text"
  label: string
  value: string
  color?: string | null
  subtitle?: string | null
}

export interface UsageLineBadge {
  type: "badge"
  label: string
  value: string
  color?: string | null
}

export type UsageLine = UsageLineProgress | UsageLineText | UsageLineBadge

export interface ProviderUsage {
  providerId: string
  displayName: string
  plan?: string
  lines: UsageLine[]
  fetchedAt: string
}

/* ─── Hook ─── */

const OPENUSAGE_URL = "http://127.0.0.1:6736/v1/usage"
const POLL_INTERVAL = 30_000 // 30s

export function useOpenUsage() {
  const [providers, setProviders] = useState<ProviderUsage[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isAvailable, setIsAvailable] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchUsage = useCallback(async () => {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 3000)

      const res = await fetch(OPENUSAGE_URL, { signal: controller.signal })
      clearTimeout(timeout)

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }

      const data: ProviderUsage[] = await res.json()
      setProviders(data)
      setIsAvailable(true)
      setError(null)
    } catch {
      setIsAvailable(false)
      setProviders([])
      setError("OpenUsage not reachable")
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
