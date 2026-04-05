"use client"

import { useEffect, useRef } from "react"
import { hapticSuccess, hapticError } from "@/lib/haptics"
import type { HermesMessage } from "@/hooks/use-hermes-bridge"

/** Fires haptic feedback when agent finishes responding or errors */
export function useHapticFeedback(messages: HermesMessage[]) {
  const prevStatusRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    const last = messages[messages.length - 1]
    if (!last || last.role !== "assistant") return
    const prev = prevStatusRef.current
    prevStatusRef.current = last.status
    if (prev === "streaming" && last.status === "ready") hapticSuccess()
    if (last.status === "error" && prev !== "error") hapticError()
  }, [messages])
}
