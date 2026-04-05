"use client"

import { useCallback, useRef, useState } from "react"

export function useSwipeGesture(
  isMobile: boolean,
  sidebarOpen: boolean,
  setSidebarOpen: (v: boolean) => void,
) {
  const swipeRef = useRef<{ startX: number; startY: number } | null>(null)
  const [agentPanelOpen, setAgentPanelOpen] = useState(false)

  const handleSwipeStart = useCallback((e: React.TouchEvent) => {
    swipeRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY }
  }, [])

  const handleSwipeEnd = useCallback((e: React.TouchEvent) => {
    if (!swipeRef.current || !isMobile) return
    const dx = e.changedTouches[0].clientX - swipeRef.current.startX
    const dy = Math.abs(e.changedTouches[0].clientY - swipeRef.current.startY)
    swipeRef.current = null
    if (dy > 80 || Math.abs(dx) < 60) return

    if (dx > 0) {
      if (agentPanelOpen) setAgentPanelOpen(false)
      else setSidebarOpen(true)
    } else {
      if (sidebarOpen) setSidebarOpen(false)
      else setAgentPanelOpen(true)
    }
  }, [isMobile, sidebarOpen, agentPanelOpen, setSidebarOpen])

  return { agentPanelOpen, setAgentPanelOpen, handleSwipeStart, handleSwipeEnd }
}
