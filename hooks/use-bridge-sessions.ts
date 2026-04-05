"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { HOME_SESSION_ID, sessionIdToTarget, targetToThreadKey, threadKeyToSessionId, type ActivityEntry, type BridgeEvent, type ConversationTarget, type SessionInfo } from "@/types/hermes"

interface UseBridgeSessionsOptions {
  sendAction: (action: string, data?: Record<string, unknown>) => void
}

export function useBridgeSessions({ sendAction }: UseBridgeSessionsOptions) {
  const [sessionsList, setSessionsList] = useState<SessionInfo[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string>(HOME_SESSION_ID)
  const [activities, setActivities] = useState<ActivityEntry[]>([])
  const [unreadSessions, setUnreadSessions] = useState<Set<string>>(new Set())
  const [mutedSessions, setMutedSessions] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set()
    try {
      const saved = localStorage.getItem("iris_muted_sessions")
      return saved ? new Set(JSON.parse(saved)) : new Set()
    } catch { return new Set() }
  })
  const activitiesBySession = useRef<Record<string, ActivityEntry[]>>({})
  const activeSessionIdRef = useRef(activeSessionId)
  // Keep ref in sync with state — both eagerly (on write) and via effect (on commit)
  useEffect(() => { activeSessionIdRef.current = activeSessionId }, [activeSessionId])

  const getActiveSessionId = useCallback(() => activeSessionIdRef.current, [])

  const setActiveSessionFromEvent = useCallback((sessionId: string) => {
    activeSessionIdRef.current = sessionId
    setActiveSessionId(sessionId)
    const cached = activitiesBySession.current[sessionId]
    setActivities(cached ? [...cached] : [])
    setUnreadSessions((prev) => {
      const next = new Set(prev)
      next.delete(sessionId)
      return next
    })
  }, [])

  const updateActivities = useCallback((updater: (prev: ActivityEntry[]) => ActivityEntry[]) => {
    setActivities((prev) => {
      const next = updater(prev)
      activitiesBySession.current[activeSessionIdRef.current] = next
      return next
    })
  }, [])

  const setActivitiesForSession = useCallback((sessionId: string, entries: ActivityEntry[]) => {
    activitiesBySession.current[sessionId] = entries
    if (sessionId === activeSessionIdRef.current) {
      setActivities(entries)
    }
  }, [])

  const getCachedActivities = useCallback(
    (sessionId: string) => activitiesBySession.current[sessionId] || [],
    [],
  )

  const toggleMuteSession = useCallback((sessionId: string) => {
    setMutedSessions(prev => {
      const next = new Set(prev)
      if (next.has(sessionId)) next.delete(sessionId)
      else next.add(sessionId)
      localStorage.setItem("iris_muted_sessions", JSON.stringify([...next]))
      return next
    })
  }, [])

  const markSessionUnread = useCallback((sessionId: string) => {
    if (mutedSessions.has(sessionId)) return  // Skip muted sessions
    setUnreadSessions((prev) => {
      const next = new Set(prev)
      next.add(sessionId)
      return next
    })
  }, [mutedSessions])

  const clearUnreadForSession = useCallback((sessionId: string) => {
    setUnreadSessions((prev) => {
      const next = new Set(prev)
      next.delete(sessionId)
      return next
    })
  }, [])

  const listSessions = useCallback(() => {
    sendAction("list_sessions")
  }, [sendAction])

  const resumeSession = useCallback((sessionId: string) => {
    sendAction("resume_session", { session_id: sessionId })
    activeSessionIdRef.current = sessionId
    setActiveSessionId(sessionId)
    const cached = activitiesBySession.current[sessionId] || []
    setActivities(cached)
    clearUnreadForSession(sessionId)
  }, [sendAction, clearUnreadForSession])

  const deleteSession = useCallback((sessionId: string) => {
    if (sessionId === HOME_SESSION_ID) return
    sendAction("delete_session", { session_id: sessionId })
    // Clean up cached state for deleted session
    delete activitiesBySession.current[sessionId]
  }, [sendAction])

  const newSession = useCallback(() => {
    const timestamp = new Date().toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    sendAction("insert_divider", { session_id: activeSessionIdRef.current, text: timestamp })
    sendAction("new_session")
  }, [sendAction])

  const handleEvent = useCallback((event: BridgeEvent): boolean => {
    if (event.type === "sessions.list") {
      const sessions = ((event.sessions as SessionInfo[]) || []).sort(
        (a, b) => (b.last_active || b.started_at || 0) - (a.last_active || a.started_at || 0),
      )
      setSessionsList(sessions)
      return true
    }
    return false
  }, [])

  const activeTarget = useMemo(() => sessionIdToTarget(activeSessionId), [activeSessionId])

  const navigateTo = useCallback((target: ConversationTarget) => {
    const sessionId = threadKeyToSessionId(targetToThreadKey(target))
    resumeSession(sessionId)
  }, [resumeSession])

  return {
    sessionsList,
    activeSessionId,
    activeTarget,
    navigateTo,
    activities,
    unreadSessions,
    mutedSessions,
    toggleMuteSession,
    listSessions,
    resumeSession,
    deleteSession,
    newSession,
    getActiveSessionId,
    setActiveSessionFromEvent,
    updateActivities,
    setActivitiesForSession,
    getCachedActivities,
    markSessionUnread,
    clearUnreadForSession,
    handleEvent,
  }
}
