"use client"

import { useCallback, useState } from "react"
import type { BridgeEvent, QueueStatus, AgentHealth } from "@/types/hermes"

interface UseBridgeHealthOptions {
  sendAction: (action: string, data?: Record<string, unknown>) => void
}

export type EvolutionStatus = {
  target: string
  type: string
  profile?: string
  status: "running" | "completed" | "error"
  error?: string
  startedAt: number
}

export function useBridgeHealth({ sendAction }: UseBridgeHealthOptions) {
  const [queueStatus, setQueueStatus] = useState<QueueStatus>({})
  const [healthData, setHealthData] = useState<Record<string, AgentHealth>>({})
  const [sessionRoster, setSessionRoster] = useState<string[]>([])
  const [sessionRosterSessionId, setSessionRosterSessionId] = useState("")
  const [evolutionStatus, setEvolutionStatus] = useState<EvolutionStatus | null>(null)

  const requestQueueStatus = useCallback(() => sendAction("get_queue_status"), [sendAction])
  const requestHealth = useCallback(() => sendAction("get_health"), [sendAction])
  const restartAgent = useCallback((profile: string) => sendAction("restart_agent", { profile }), [sendAction])

  const handleEvent = useCallback((event: BridgeEvent): boolean => {
    switch (event.type) {
      case "health.state":
        setHealthData((event.agents as Record<string, AgentHealth>) || {})
        return true
      case "agent.restarted":
        return true
      case "session.roster": {
        const sid = event.session_id as string
        const agents = (event.agents as string[]) || []
        setSessionRoster(agents)
        setSessionRosterSessionId(sid)
        return true
      }
      case "queue.status":
        setQueueStatus((event.queues as QueueStatus) || {})
        return true
      case "queue.job_queued":
      case "queue.job_started":
        return true
      case "evolution.started":
        setEvolutionStatus({
          target: (event.target as string) || "",
          type: (event.type_field as string) || (event as Record<string, unknown>).type === "evolution.started" ? ((event as Record<string, unknown>)["type"] as string || "skill") : "skill",
          profile: (event.profile as string) || undefined,
          status: "running",
          startedAt: Date.now(),
        })
        return true
      case "evolution.completed":
        setEvolutionStatus(prev => prev ? { ...prev, status: "completed" } : null)
        setTimeout(() => setEvolutionStatus(null), 10000)
        return true
      case "evolution.error":
        setEvolutionStatus(prev => prev ? { ...prev, status: "error", error: (event.error as string) || "Unknown error" } : null)
        setTimeout(() => setEvolutionStatus(null), 15000)
        return true
      default:
        return false
    }
  }, [])

  return {
    queueStatus,
    healthData,
    sessionRoster,
    sessionRosterSessionId,
    evolutionStatus,
    requestQueueStatus,
    requestHealth,
    restartAgent,
    handleEvent,
  }
}
