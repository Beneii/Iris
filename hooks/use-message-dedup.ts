"use client"

import { useRef, useCallback } from "react"

/**
 * Unified message deduplication.
 *
 * Three strategies:
 * 1. localEcho — tracks messages we sent, suppresses the server echo
 * 2. recentUser — prevents rapid double-sends of identical user messages
 * 3. assistant — prevents duplicate final responses within a time window
 */
export function useMessageDedup() {
  // Strategy 1: local echo tracking (key = "text-timestamp")
  const localEcho = useRef<Set<string>>(new Set())

  // Strategy 2: recent user message (key = "user-text-bucket", TTL 5s)
  const recentUser = useRef<Set<string>>(new Set())

  // Strategy 3: assistant response dedup (key = "sessionId:response", TTL 8s)
  const assistantSeen = useRef<Map<string, number>>(new Map())

  /** Track a message we're about to send (for echo suppression). */
  const trackLocalSend = useCallback((text: string) => {
    const ts = Math.floor(Date.now() / 1000)
    localEcho.current.add(`${text}-${ts}`)

    const bucket = `user-${text}-${Math.floor(Date.now() / 2000)}`
    recentUser.current.add(bucket)
    setTimeout(() => recentUser.current.delete(bucket), 5000)
  }, [])

  /** Check if an incoming user message is an echo of something we sent. */
  const isLocalEcho = useCallback((text: string, timestamp?: number): boolean => {
    const ts = Math.floor(timestamp || Date.now() / 1000)
    // Check exact match and ±1 second tolerance
    for (const offset of [0, -1, 1]) {
      const key = `${text}-${ts + offset}`
      if (localEcho.current.has(key)) {
        localEcho.current.delete(key)
        return true
      }
    }
    // Also check recent bucket
    const bucket = `user-${text}-${Math.floor(Date.now() / 2000)}`
    if (recentUser.current.has(bucket)) return true

    return false
  }, [])

  /** Check if an assistant response is a duplicate (same session+content within 8s). */
  const isAssistantDuplicate = useCallback((sessionId: string, response: string): boolean => {
    const key = `${sessionId}:${response}`
    const now = Date.now()
    const lastSeen = assistantSeen.current.get(key)
    if (lastSeen && now - lastSeen < 8000) return true

    assistantSeen.current.set(key, now)

    // Cleanup old entries
    for (const [k, ts] of assistantSeen.current) {
      if (now - ts > 30000) assistantSeen.current.delete(k)
    }
    return false
  }, [])

  return { trackLocalSend, isLocalEcho, isAssistantDuplicate }
}
