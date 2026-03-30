"use client"

import { useCallback, useEffect, useRef, useState } from "react"

// ─── Types ───
export type ToolCall = {
  id: string
  name: string
  status: ToolStatus
  preview: string
  args?: Record<string, unknown> | string
  startedAt: string
}

export type MessageSegment =
  | { type: "text"; content: string }
  | { type: "tool"; toolCall: ToolCall }

export type HermesMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: string
  status: "ready" | "streaming" | "error"
  reasoning?: string
  step?: number
  toolCalls?: ToolCall[]
  segments?: MessageSegment[]
  images?: string[]  // data URLs for user-sent images
}

export type ToolStatus = "preparing" | "running" | "success" | "error" | "pending"

export type ActivityEntry = {
  id: string
  kind: "tool" | "memory" | "subagent" | "compaction" | "approval" | "mcp" | "status"
  title: string
  status: ToolStatus
  summary: string
  timestamp: string
  output: string[]
  args?: Record<string, unknown> | string
  subAgentCount?: number
}

export type SessionInfo = {
  id: string
  title: string
  started_at: number
  last_active: number
  message_count: number
  preview: string
}

export type CronJob = {
  id: string
  name: string
  prompt: string
  schedule_display: string
  enabled: boolean
  state: "scheduled" | "running" | "paused" | "completed"
  created_at: string
  next_run_at: string | null
  last_run_at: string | null
  last_status: "ok" | "error" | null
  last_error: string | null
  repeat: { times: number | null; completed: number }
  deliver: string
  model: string | null
  skills: string[]
}

export type JobOutput = {
  filename: string
  content: string
  timestamp: string
}

export const HOME_SESSION_ID = "home"

export type ConnectionState = "connecting" | "connected" | "disconnected"

type BridgeEvent = {
  type: string
  [key: string]: unknown
}

const BRIDGE_URL = (() => {
  if (typeof window === "undefined") return "ws://localhost:8643/ws"
  const host = window.location.hostname
  // Custom protocols (iris://) or empty hostname → use localhost
  if (!host || host === "app" || window.location.protocol === "iris:") return "ws://localhost:8643/ws"
  return `ws://${host}:8643/ws`
})()

export function useHermesBridge() {
  const [messages, setMessages] = useState<HermesMessage[]>([])
  const [activities, setActivities] = useState<ActivityEntry[]>([])
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting")
  const [model, setModel] = useState("")
  const [provider, setProvider] = useState("")
  const [agentName, setAgentName] = useState("Hermes")
  const [contextPressure, setContextPressure] = useState(0)
  const [currentStep, setCurrentStep] = useState(0)
  const [isProcessing, setIsProcessing] = useState(false)
  const [memoryData, setMemoryData] = useState<{memory: string, user: string} | null>(null)
  const [configData, setConfigData] = useState<Record<string, unknown> | null>(null)
  const [toolsetsData, setToolsetsData] = useState<{name: string, available: boolean, tools: string[], requirements: string[]}[] | null>(null)
  const [sessionsList, setSessionsList] = useState<SessionInfo[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string>(HOME_SESSION_ID)
  const [jobsList, setJobsList] = useState<CronJob[]>([])
  const [jobOutputs, setJobOutputs] = useState<Record<string, JobOutput[]>>({})
  const [skillsData, setSkillsData] = useState<{name: string, category: string, description: string, enabled: boolean}[] | null>(null)
  const [permissionsData, setPermissionsData] = useState<Record<string, string> | null>(null)
  const [unreadSessions, setUnreadSessions] = useState<Set<string>>(new Set())
  const activitiesBySession = useRef<Record<string, ActivityEntry[]>>({})
  const activeSessionIdRef = useRef(activeSessionId)
  activeSessionIdRef.current = activeSessionId

  // ─── Helpers to keep toolCalls + segments in sync ───
  const upsertToolInMessage = (m: HermesMessage, tc: ToolCall, replace?: { name: string; status: ToolStatus }): HermesMessage => {
    const toolCalls = [...(m.toolCalls || [])]
    const segs = [...(m.segments || [])]
    if (replace) {
      const tcIdx = toolCalls.findIndex((t) => t.name === replace.name && t.status === replace.status)
      const segIdx = segs.findIndex((s) => s.type === "tool" && s.toolCall.name === replace.name && s.toolCall.status === replace.status)
      if (tcIdx >= 0) { toolCalls[tcIdx] = tc } else { toolCalls.push(tc) }
      if (segIdx >= 0) { segs[segIdx] = { type: "tool", toolCall: tc } } else { segs.push({ type: "tool", toolCall: tc }) }
    } else {
      toolCalls.push(tc)
      segs.push({ type: "tool", toolCall: tc })
    }
    return { ...m, toolCalls, segments: segs }
  }

  const finishAllTools = (m: HermesMessage): HermesMessage => {
    const finish = (tc: ToolCall) => tc.status === "running" || tc.status === "preparing" ? { ...tc, status: "success" as ToolStatus } : tc
    return {
      ...m,
      toolCalls: m.toolCalls?.map(finish),
      segments: m.segments?.map((s) => s.type === "tool" ? { ...s, toolCall: finish(s.toolCall) } : s),
    }
  }

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectAttempts = useRef(0)
  const streamingMsgRef = useRef<string | null>(null)
  const reasoningRef = useRef("")
  const localMessageIds = useRef<Set<string>>(new Set())
  const textBufferRef = useRef("")
  const drainTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const now = () =>
    new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

  // ─── Connect ───
  const connect = useCallback(() => {
    // Close any existing connection first
    if (wsRef.current) {
      const s = wsRef.current.readyState
      if (s === WebSocket.OPEN || s === WebSocket.CONNECTING) {
        wsRef.current.close()
      }
      wsRef.current = null
    }

    const ws = new WebSocket(BRIDGE_URL)
    wsRef.current = ws

    ws.onopen = () => {
      // Only accept if this is still the current socket
      if (wsRef.current !== ws) { ws.close(); return }
      setConnectionState("connected")
      reconnectAttempts.current = 0
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current)
        reconnectTimer.current = null
      }
      // If remote connection, send API key for auth
      const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
      if (!isLocal) {
        const apiKey = localStorage.getItem("iris_api_key") || ""
        if (apiKey) {
          ws.send(JSON.stringify({ api_key: apiKey }))
        }
      }
      // Report foreground — any connected client counts (desktop or mobile)
      ws.send(JSON.stringify({ action: "app_state", state: "foreground" }))
    }

    ws.onclose = () => {
      // Only reconnect if this is still the current socket
      if (wsRef.current !== ws) return
      wsRef.current = null
      reconnectAttempts.current += 1
      if (reconnectAttempts.current >= 3) {
        // Stop retrying after 3 failed attempts — require manual reconnect
        setConnectionState("disconnected")
        return
      }
      setConnectionState("connecting")
      // Auto-reconnect after 3s
      reconnectTimer.current = setTimeout(connect, 3000)
    }

    ws.onerror = () => {
      ws.close()
    }

    ws.onmessage = (e) => {
      // Ignore messages from stale sockets
      if (wsRef.current !== ws) return
      try {
        const event: BridgeEvent = JSON.parse(e.data)
        handleEvent(event)
      } catch {
        // ignore parse errors
      }
    }
  }, [])

  // ─── Event handler ───
  const handleEvent = useCallback((event: BridgeEvent) => {
    switch (event.type) {
      case "auth.failed": {
        // Prompt for API key on remote connections
        const key = prompt("Enter Iris API key:")
        if (key) {
          localStorage.setItem("iris_api_key", key)
          // Reconnect with the key
          wsRef.current?.close()
          setTimeout(() => connect(), 500)
        }
        break
      }

      case "connection.ready": {
        setModel(event.model as string || "")
        setProvider(event.provider as string || "")
        setAgentName(event.agent_name as string || "Hermes")
        const runningSessions = (event.running_sessions as string[]) || []
        // If the active session is currently processing on the bridge, keep isProcessing true
        // and create a placeholder streaming message so incoming deltas have somewhere to land
        if (runningSessions.includes(activeSessionIdRef.current) && !streamingMsgRef.current) {
          const placeholderId = `reconnect-${Date.now()}`
          streamingMsgRef.current = placeholderId
          setIsProcessing(true)
          setMessages((prev) => [
            ...prev,
            { id: placeholderId, role: "assistant", content: "", timestamp: now(), status: "streaming", segments: [] },
          ])
        } else if (!runningSessions.includes(activeSessionIdRef.current)) {
          // Session finished while we were away — reset processing state
          setIsProcessing(false)
          streamingMsgRef.current = null
          // Finalize any stuck streaming messages
          setMessages((prev) =>
            prev.map((m) => m.status === "streaming" ? { ...m, status: "ready" as const } : m)
          )
        }
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ action: "list_sessions" }))
          wsRef.current.send(JSON.stringify({ action: "resume_session", session_id: activeSessionIdRef.current }))
        }
        break
      }

      case "message.user": {
        const text = event.text as string
        const msgTimestamp = event.timestamp as number
        // Check if this is our own message (already added locally)
        const key = `${text}-${Math.floor((msgTimestamp || 0))}`
        if (localMessageIds.current.has(key)) {
          localMessageIds.current.delete(key)
          break
        }
        // Message from another client — add it
        setMessages((prev) => [
          ...prev,
          {
            id: `user-remote-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            role: "user",
            content: text,
            timestamp: now(),
            status: "ready",
          },
        ])
        break
      }

      case "response.started": {
        const msgId = `iris-${Date.now()}`
        streamingMsgRef.current = msgId
        reasoningRef.current = ""
        setCurrentStep(0)
        setIsProcessing(true)
        // Finalize any previous messages still stuck at "streaming" and create new one
        setMessages((prev) => [
          ...prev.map((m) =>
            m.status === "streaming"
              ? { ...finishAllTools(m), status: "ready" as const }
              : m
          ),
          {
            id: msgId,
            role: "assistant",
            content: "",
            timestamp: now(),
            status: "streaming",
            segments: [],
          },
        ])
        break
      }

      case "message.delta": {
        const text = event.text as string
        if (!text || !streamingMsgRef.current) break
        // Direct append — no buffering, no race conditions
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== streamingMsgRef.current) return m
            const segs = [...(m.segments || [])]
            const last = segs[segs.length - 1]
            if (last && last.type === "text") {
              segs[segs.length - 1] = { ...last, content: last.content + text }
            } else {
              segs.push({ type: "text", content: text })
            }
            return { ...m, content: m.content + text, segments: segs }
          })
        )
        break
      }

      case "message.delta.end":
        // Streaming phase ended (tools may follow)
        break

      case "reasoning.delta": {
        const text = event.text as string
        if (!text || !streamingMsgRef.current) break
        if (!reasoningRef.current.endsWith(text)) {
          reasoningRef.current += text
        }
        const reasoning = reasoningRef.current
        setMessages((prev) =>
          prev.map((m) =>
            m.id === streamingMsgRef.current ? { ...m, reasoning } : m
          )
        )
        break
      }

      case "step": {
        // Mark all running/preparing tools as completed (new step = previous tools done)
        setActivities((prev) =>
          prev.map((a) =>
            a.status === "running" || a.status === "preparing"
              ? { ...a, status: "success" as const }
              : a
          )
        )
        // Also update tool calls + segments in the current streaming message
        if (streamingMsgRef.current) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === streamingMsgRef.current ? finishAllTools(m) : m
            )
          )
        }
        const step = event.iteration as number
        setCurrentStep(step)
        if (streamingMsgRef.current) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === streamingMsgRef.current ? { ...m, step } : m
            )
          )
        }
        break
      }

      case "response.completed": {
        setIsProcessing(false)
        setActivities((prev) =>
          prev.map((a) =>
            a.status === "running" || a.status === "preparing"
              ? { ...a, status: "success" as const }
              : a
          )
        )
        const finalResponse = event.final_response as string
        const completedSessionId = event.session_id as string
        if (completedSessionId && completedSessionId !== activeSessionIdRef.current && finalResponse) {
          setUnreadSessions((prev) => new Set(prev).add(completedSessionId))
        }
        if (streamingMsgRef.current) {
          // Single atomic update: flush buffer + set final content + clear segments
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id === streamingMsgRef.current) {
                // Always prefer finalResponse — it's processed (media refs converted)
                const content = finalResponse || m.content || ""
                const finished = finishAllTools(m)
                return { ...finished, content, status: "ready" as const, segments: undefined }
              }
              if (m.status === "streaming")
                return { ...finishAllTools(m), status: "ready" as const }
              return m
            })
          )
        } else if (finalResponse) {
          setMessages((prev) => [
            ...prev.map((m) =>
              m.status === "streaming"
                ? { ...finishAllTools(m), status: "ready" as const }
                : m
            ),
            {
              id: `completed-${Date.now()}`,
              role: "assistant" as const,
              content: finalResponse,
              timestamp: now(),
              status: "ready" as const,
            },
          ])
        }
        streamingMsgRef.current = null
        reasoningRef.current = ""
        break
      }

      case "response.error": {
        setIsProcessing(false)
        // Mark any remaining running/preparing activities as error
        setActivities((prev) =>
          prev.map((a) =>
            a.status === "running" || a.status === "preparing"
              ? { ...a, status: "error" as const }
              : a
          )
        )
        const errorText = event.error as string || "An error occurred"
        if (streamingMsgRef.current) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === streamingMsgRef.current
                ? { ...m, status: "error" as const, content: m.content || errorText }
                : m
            )
          )
          streamingMsgRef.current = null
        } else {
          // Error before streaming started — create an error message
          setMessages((prev) => [
            ...prev,
            {
              id: `error-${Date.now()}`,
              role: "assistant",
              content: errorText,
              timestamp: now(),
              status: "error",
            },
          ])
        }
        break
      }

      case "response.cancelled": {
        setIsProcessing(false)
        if (streamingMsgRef.current) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === streamingMsgRef.current
                ? { ...m, status: "ready" as const, content: m.content || "[Interrupted]" }
                : m
            )
          )
          streamingMsgRef.current = null
        }
        break
      }

      case "tool.preparing": {
        const toolName = event.tool_name as string
        addActivity({
          id: `prep-${Date.now()}`,
          kind: "tool",
          title: toolName,
          status: "preparing",
          summary: "Preparing...",
          timestamp: now(),
          output: [],
        })
        if (streamingMsgRef.current) {
          const tc: ToolCall = {
            id: `prep-${Date.now()}`,
            name: toolName,
            status: "preparing",
            preview: "Generating arguments...",
            startedAt: now(),
          }
          setMessages((prev) =>
            prev.map((m) => m.id === streamingMsgRef.current ? upsertToolInMessage(m, tc) : m)
          )
        }
        break
      }

      case "tool.started": {
        const toolId = event.tool_id as string
        const toolName = event.tool_name as string
        const args = event.args as Record<string, unknown> | string | undefined
        const preview = (event.preview as string) || ""
        upsertActivity(toolName, {
          id: toolId,
          kind: "tool",
          title: toolName,
          status: "running",
          summary: preview,
          timestamp: now(),
          output: [],
          args,
        })
        // Attach or update in current streaming message
        if (streamingMsgRef.current) {
          const tc: ToolCall = {
            id: toolId,
            name: toolName,
            status: "running",
            preview,
            args,
            startedAt: now(),
          }
          setMessages((prev) =>
            prev.map((m) => m.id === streamingMsgRef.current
              ? upsertToolInMessage(m, tc, { name: toolName, status: "preparing" })
              : m
            )
          )
        }
        break
      }

      case "message.image": {
        const imgUrl = event.url as string
        const alt = (event.alt as string) || "Image"
        if (!streamingMsgRef.current) break
        const fullUrl = `http://${window.location.hostname}:8643${imgUrl}`
        const imgMarkdown = `\n![${alt}](${fullUrl})\n`
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== streamingMsgRef.current) return m
            const segs = [...(m.segments || [])]
            segs.push({ type: "text", content: imgMarkdown })
            return { ...m, content: m.content + imgMarkdown, segments: segs }
          })
        )
        break
      }

      case "memory.updated": {
        const memArgs = event.args as Record<string, unknown> | string | undefined
        const preview = (event.preview as string) || ""
        let memSummary = preview
        if (memArgs && typeof memArgs === "object") {
          const action = memArgs.action as string || ""
          const target = memArgs.target as string || ""
          const content = memArgs.content as string || memArgs.old_text as string || ""
          memSummary = `${action} → ${target}${content ? `: ${content.slice(0, 120)}` : ""}`
        }
        addActivity({
          id: `mem-${Date.now()}`,
          kind: "memory",
          title: "Memory",
          status: "success",
          summary: memSummary || preview,
          timestamp: now(),
          output: [],
          args: memArgs,
        })
        // Attach to message
        if (streamingMsgRef.current) {
          const tc: ToolCall = {
            id: `mem-${Date.now()}`,
            name: "memory",
            status: "success",
            preview: memSummary,
            args: memArgs,
            startedAt: now(),
          }
          setMessages((prev) =>
            prev.map((m) => m.id === streamingMsgRef.current ? upsertToolInMessage(m, tc) : m)
          )
        }
        break
      }

      case "subagent.spawned": {
        addActivity({
          id: (event.tool_id as string) || `sub-${Date.now()}`,
          kind: "subagent",
          title: "delegate_task",
          status: "running",
          summary: (event.preview as string) || "",
          timestamp: now(),
          output: [],
          subAgentCount: 1,
        })
        break
      }

      case "subagent.progress": {
        const summary = event.summary as string
        setActivities((prev) => {
          const subIdx = prev.findIndex((a) => a.kind === "subagent" && a.status === "running")
          if (subIdx >= 0) {
            const updated = [...prev]
            updated[subIdx] = { ...updated[subIdx], summary }
            return updated
          }
          return prev
        })
        break
      }

      case "status": {
        const eventType = event.event_type as string
        const message = event.message as string
        if (eventType === "context_pressure") {
          // Parse percentage from message if possible
          const match = message.match(/(\d+)%/)
          if (match) setContextPressure(parseInt(match[1]))
        }
        addActivity({
          id: `status-${Date.now()}`,
          kind: "status",
          title: eventType,
          status: "success",
          summary: message,
          timestamp: now(),
          output: [],
        })
        break
      }

      case "memory.state": {
        setMemoryData({
          memory: event.memory as string || "",
          user: event.user as string || "",
        })
        break
      }

      case "toolsets.list": {
        const toolsets = event.toolsets as {name: string, available: boolean, tools: string[], requirements: string[]}[]
        setToolsetsData(toolsets)
        break
      }

      case "skills.list": {
        const skills = event.skills as {name: string, category: string, description: string, enabled: boolean}[]
        setSkillsData(skills || [])
        break
      }

      case "config.state": {
        setConfigData({
          model: event.model,
          provider: event.provider,
          agent_name: event.agent_name,
          base_url: event.base_url,
          ...(event.config as Record<string, unknown> || {}),
        })
        break
      }

      case "permissions.state": {
        const perms = event.permissions as Record<string, string>
        setPermissionsData(perms || null)
        break
      }

      case "sessions.list": {
        const sessions = (event.sessions as SessionInfo[] || [])
          .sort((a, b) => (b.last_active || b.started_at || 0) - (a.last_active || a.started_at || 0))
        setSessionsList(sessions)
        break
      }

      case "session.created": {
        const newSid = event.session_id as string
        // Don't auto-switch to home session on server startup creation
        if (newSid === HOME_SESSION_ID) {
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ action: "list_sessions" }))
          }
          break
        }
        setActiveSessionId(newSid)
        setMessages([])
        setActivities([])
        setContextPressure(0)
        setCurrentStep(0)
        streamingMsgRef.current = null
        reasoningRef.current = ""
        // Refresh session list
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ action: "list_sessions" }))
        }
        break
      }

      case "session.deleted":
        // Session list will be refreshed via sessions.list event
        break

      case "hermes.message": {
        // Proactive message from Hermes (autonomy daemon, cron, etc.)
        const hmSid = event.session_id as string
        const hmText = event.text as string
        const hmTitle = event.title as string || "Hermes"
        // Mark session as unread if it's not the active one
        if (hmSid && hmSid !== activeSessionIdRef.current) {
          setUnreadSessions((prev) => new Set(prev).add(hmSid))
        }
        // If we're viewing this session, add the message directly
        if (hmSid === activeSessionIdRef.current && hmText) {
          setMessages((prev) => [
            ...prev,
            {
              id: `hermes-${Date.now()}`,
              role: "assistant",
              content: hmText,
              timestamp: now(),
              status: "ready",
            },
          ])
        }
        // Refresh session list to show the new session
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ action: "list_sessions" }))
        }
        break
      }

      case "hermes.nudge": {
        // Lightweight notification — no session, just a toast/alert
        // The desktop notification is handled by Electron polling NOTIFICATION_DIR
        // For in-app, we could emit to a toast system in the future
        break
      }

      case "jobs.list": {
        const jobs = event.jobs as CronJob[]
        setJobsList(jobs || [])
        break
      }

      case "job.created": {
        // The updated list will come via jobs.list event
        break
      }

      case "job.output": {
        const jobId = event.job_id as string
        const outputs = event.outputs as JobOutput[]
        setJobOutputs((prev) => ({ ...prev, [jobId]: outputs || [] }))
        break
      }

      case "session.resumed": {
        const resumedSid = event.session_id as string
        const historyMsgs = event.messages as { role: string; content: string; timestamp: string }[]
        // Save current activities before switching
        activitiesBySession.current[activeSessionIdRef.current] = activities
        setActiveSessionId(resumedSid)
        // Restore activities — prefer server-sent activities, fall back to cached
        const serverActivities = event.activities as ActivityEntry[] | undefined
        const restoredActivities = serverActivities && serverActivities.length > 0
          ? serverActivities.map((a: Record<string, unknown>, i: number) => ({
              id: (a.id as string) || `restored-${i}-${Date.now()}`,
              kind: (a.kind as string) || (a.type as string)?.split(".")[0] || "tool",
              title: (a.title as string) || (a.tool_name as string) || (a.type as string) || "Event",
              status: "success" as const,
              summary: (a.summary as string) || "",
              timestamp: a.timestamp ? new Date((a.timestamp as number) * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "",
              output: (a.output as string[]) || [],
              args: a.args as Record<string, unknown> | undefined,
            }))
          : activitiesBySession.current[resumedSid] || []
        setActivities(restoredActivities as ActivityEntry[])
        setContextPressure(0)
        setCurrentStep(0)
        // Convert history to HermesMessage[]
        const restored: HermesMessage[] = (historyMsgs || []).map((m, i) => ({
          id: `history-${i}-${Date.now()}`,
          role: m.role as "user" | "assistant",
          content: m.content || "",
          timestamp: m.timestamp || "",
          status: "ready" as const,
        }))
        // If we set a reconnect placeholder in connection.ready, preserve it
        // so incoming message.delta events still have a message to update
        if (streamingMsgRef.current) {
          const placeholder = streamingMsgRef.current
          setMessages([
            ...restored,
            { id: placeholder, role: "assistant", content: "", timestamp: now(), status: "streaming" },
          ])
          // isProcessing stays true, streamingMsgRef stays set
        } else {
          setIsProcessing(false)
          streamingMsgRef.current = null
          reasoningRef.current = ""
          setMessages(restored)
        }
        break
      }
    }
  }, [])

  // ─── Activity helpers ───
  const addActivity = useCallback((entry: ActivityEntry) => {
    setActivities((prev) => {
      const next = [entry, ...prev].slice(0, 20)
      activitiesBySession.current[activeSessionId] = next
      return next
    })
  }, [activeSessionId])

  const upsertActivity = useCallback((toolName: string, entry: ActivityEntry) => {
    setActivities((prev) => {
      // Replace "preparing" entry for same tool, or prepend
      const prepIdx = prev.findIndex(
        (a) => a.title === toolName && a.status === "preparing"
      )
      if (prepIdx >= 0) {
        const updated = [...prev]
        updated[prepIdx] = entry
        return updated
      }
      return [entry, ...prev].slice(0, 20)
    })
  }, [])

  // ─── Send message ───
  const sendMessage = useCallback(
    (text: string) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
      if (isProcessing) return  // Block concurrent sends

      // Tag this message so we can ignore the echo from the bridge
      const ts = Math.floor(Date.now() / 1000)
      localMessageIds.current.add(`${text}-${ts}`)

      // Add user message immediately
      const userMsg: HermesMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: text,
        timestamp: now(),
        status: "ready",
      }
      setMessages((prev) => [...prev, userMsg])

      // Send to bridge
      wsRef.current.send(
        JSON.stringify({
          action: "send_message",
          session_id: activeSessionId,
          text,
        })
      )
    },
    [isProcessing, activeSessionId]
  )

  // ─── Cancel/interrupt response ───
  const cancelResponse = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    wsRef.current.send(JSON.stringify({
      action: "cancel_response",
      session_id: activeSessionId,
    }))
    setIsProcessing(false)
    // Mark any streaming messages as ready
    setMessages((prev) =>
      prev.map((m) =>
        m.status === "streaming"
          ? { ...m, status: "ready" as const, content: m.content || "[Interrupted]" }
          : m
      )
    )
    streamingMsgRef.current = null
  }, [activeSessionId])

  // ─── Request helpers ───
  const sendAction = useCallback((action: string, data?: Record<string, unknown>) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    wsRef.current.send(JSON.stringify({ action, ...data }))
  }, [])

  const requestMemory = useCallback(() => sendAction("get_memory"), [sendAction])
  const requestSkills = useCallback(() => sendAction("get_skills"), [sendAction])
  const requestConfig = useCallback(() => sendAction("get_config"), [sendAction])
  const requestToolsets = useCallback(() => sendAction("get_toolsets"), [sendAction])
  const requestSoul = useCallback(() => sendAction("get_soul"), [sendAction])
  const requestPermissions = useCallback(() => sendAction("get_permissions"), [sendAction])
  const setPermission = useCallback((category: string, value: string) => {
    sendAction("set_permissions", { category, value })
  }, [sendAction])
  const setConfig = useCallback((key: string, value: unknown) => {
    sendAction("set_config", { key, value })
  }, [sendAction])

  // ─── Session actions ───
  const listSessions = useCallback(() => sendAction("list_sessions"), [sendAction])
  const resumeSession = useCallback((sessionId: string) => {
    sendAction("resume_session", { session_id: sessionId })
    setActiveSessionId(sessionId)
    setUnreadSessions((prev) => {
      const next = new Set(prev)
      next.delete(sessionId)
      return next
    })
  }, [sendAction])
  const deleteSession = useCallback((sessionId: string) => {
    if (sessionId === HOME_SESSION_ID) return  // Can't delete home
    sendAction("delete_session", { session_id: sessionId })
    // If we're deleting the active session, clear the chat
    if (sessionId === activeSessionId) {
      setMessages([])
      setActivities([])
      setActiveSessionId("default")
    }
  }, [sendAction, activeSessionId])

  // ─── Job actions ───
  const listJobs = useCallback(() => sendAction("list_jobs"), [sendAction])
  const createJob = useCallback((data: { prompt: string; schedule: string; name?: string; repeat?: unknown; deliver?: string }) => {
    sendAction("create_job", data)
  }, [sendAction])
  const pauseJob = useCallback((jobId: string) => sendAction("pause_job", { job_id: jobId }), [sendAction])
  const resumeJob_ = useCallback((jobId: string) => sendAction("resume_job", { job_id: jobId }), [sendAction])
  const triggerJob = useCallback((jobId: string) => sendAction("trigger_job", { job_id: jobId }), [sendAction])
  const removeJob = useCallback((jobId: string) => sendAction("remove_job", { job_id: jobId }), [sendAction])
  const getJobOutput = useCallback((jobId: string) => sendAction("get_job_output", { job_id: jobId }), [sendAction])

  // ─── New session ───
  const newSession = useCallback(() => {
    // Save current activities before switching
    activitiesBySession.current[activeSessionId] = activities
    setMessages([])
    setActivities([])
    sendAction("new_session")
  }, [sendAction, activeSessionId, activities])

  // ─── Send message with attachments ───
  const sendMessageWithAttachments = useCallback(
    (text: string, attachments: { data: string; mime: string }[], displayImages?: string[]) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
      if (isProcessing) return

      const ts = Math.floor(Date.now() / 1000)
      localMessageIds.current.add(`${text}-${ts}`)

      const userMsg: HermesMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: text,
        timestamp: now(),
        status: "ready",
        images: displayImages,
      }
      setMessages((prev) => [...prev, userMsg])

      wsRef.current.send(
        JSON.stringify({
          action: "send_message",
          session_id: activeSessionId,
          text,
          images: attachments,
        })
      )
    },
    [isProcessing, activeSessionId]
  )

  // ─── Session title derivation ───
  const getSessionTitle = useCallback(
    (sessionId: string): string => {
      const session = sessionsList.find((s) => s.id === sessionId)
      if (session?.title) return session.title
      // Derive from first user message in current chat if this is the active session
      if (sessionId === activeSessionId) {
        const firstUserMsg = messages.find((m) => m.role === "user")
        if (firstUserMsg) {
          return firstUserMsg.content.length > 60
            ? firstUserMsg.content.slice(0, 60) + "..."
            : firstUserMsg.content
        }
      }
      return "Untitled Session"
    },
    [sessionsList, activeSessionId, messages]
  )

  // ─── Manual reconnect ───
  const reconnect = useCallback(() => {
    reconnectAttempts.current = 0
    setConnectionState("connecting")
    connect()
  }, [connect])

  // ─── Activity summary ───
  const activitySummary = (() => {
    const total = activities.length
    const running = activities.filter((a) => a.status === "running" || a.status === "preparing").length
    const errors = activities.filter((a) => a.status === "error").length
    const completed = activities.filter((a) => a.status === "success").length
    const successRate = total > 0 ? completed / total : 0
    return { total, running, errors, successRate }
  })()

  // ─── Lifecycle ───
  useEffect(() => {
    connect()
    return () => {
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current)
        reconnectTimer.current = null
      }
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [connect])

  // ─── Window focus/blur → foreground/background for desktop ───
  useEffect(() => {
    if (typeof window === "undefined") return
    const onFocus = () => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ action: "app_state", state: "foreground" }))
      }
    }
    const onBlur = () => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ action: "app_state", state: "background" }))
      }
    }
    window.addEventListener("focus", onFocus)
    window.addEventListener("blur", onBlur)
    return () => {
      window.removeEventListener("focus", onFocus)
      window.removeEventListener("blur", onBlur)
    }
  }, [])

  // ─── Push notifications + foreground/background tracking (native) ───
  useEffect(() => {
    if (typeof window === "undefined") return

    const cleanup: (() => void)[] = []

    const sendAppState = (state: "foreground" | "background") => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ action: "app_state", state }))
      }
    }

    // Try to init native plugins — retry if Capacitor isn't injected yet
    const tryInit = (attempts = 0) => {
      const cap = (window as any).Capacitor
      if (!cap?.isNativePlatform?.()) {
        if (attempts < 10) setTimeout(() => tryInit(attempts + 1), 500)
        return
      }

      // Debug: send over WS so we can see in bridge logs
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ action: "debug", msg: "capacitor_detected" }))
      }
      sendAppState("foreground")

      Promise.all([
        import("@capacitor/push-notifications").catch(() => null),
        import("@capacitor/app").catch(() => null),
      ]).then(([pushMod, appMod]) => {
        if (pushMod) {
          const { PushNotifications } = pushMod
          PushNotifications.addListener("registration", (token) => {
            console.log("[iris] Push token:", token.value.slice(0, 12) + "...")
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({ action: "register_push_token", token: token.value, platform: "ios" }))
            }
          }).then((l) => cleanup.push(() => l.remove()))
          PushNotifications.addListener("registrationError", (err) => {
            console.error("[iris] Push reg error:", err)
          }).then((l) => cleanup.push(() => l.remove()))
          PushNotifications.requestPermissions().then((perm) => {
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({ action: "debug", msg: `push_permission_${perm.receive}` }))
            }
            if (perm.receive === "granted") PushNotifications.register()
          }).catch((e) => {
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({ action: "debug", msg: `push_error_${e}` }))
            }
          })
        }
        if (appMod) {
          const { App: CapApp } = appMod
          CapApp.addListener("appStateChange", ({ isActive }) => {
            sendAppState(isActive ? "foreground" : "background")
            if (isActive && pushMod) {
              pushMod.PushNotifications.removeAllDeliveredNotifications().catch(() => {})
            }
          }).then((l) => cleanup.push(() => l.remove()))
        }
      })
    }

    tryInit()

    return () => { cleanup.forEach((fn) => fn()) }
  }, [])

  return {
    messages,
    activities,
    connectionState,
    model,
    provider,
    agentName,
    memoryData,
    configData,
    toolsetsData,
    skillsData,
    permissionsData,
    contextPressure,
    currentStep,
    isProcessing,
    sendMessage,
    newSession,
    requestMemory,
    requestSkills,
    requestConfig,
    requestToolsets,
    requestSoul,
    requestPermissions,
    setPermission,
    setConfig,
    sendAction,
    sessionsList,
    activeSessionId,
    listSessions,
    resumeSession,
    deleteSession,
    jobsList,
    jobOutputs,
    listJobs,
    createJob,
    pauseJob,
    resumeJob: resumeJob_,
    triggerJob,
    removeJob,
    getJobOutput,
    sendMessageWithAttachments,
    cancelResponse,
    getSessionTitle,
    reconnect,
    activitySummary,
    unreadSessions,
  }
}
