"use client"

import { useCallback, useRef, useState } from "react"
import {
  sessionIdToTarget,
  targetToThreadKey,
  type ActivityEntry,
  type BridgeEvent,
  type HermesMessage,
  type MessageSegment,
  type ToolCall,
  type ToolStatus,
} from "@/types/hermes"

type SessionAdapter = {
  getActiveSessionId: () => string
  setActiveSessionFromEvent: (sessionId: string) => void
  updateActivities: (updater: (prev: ActivityEntry[]) => ActivityEntry[]) => void
  setActivitiesForSession: (sessionId: string, entries: ActivityEntry[]) => void
  getCachedActivities: (sessionId: string) => ActivityEntry[]
  markSessionUnread: (sessionId: string) => void
  clearUnreadForSession: (sessionId: string) => void
}

interface UseBridgeMessagesOptions {
  sendAction: (action: string, data?: Record<string, unknown>) => void
  sessions: SessionAdapter
}

const now = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

export function useBridgeMessages({ sendAction, sessions }: UseBridgeMessagesOptions) {
  const {
    getActiveSessionId,
    setActiveSessionFromEvent,
    updateActivities,
    setActivitiesForSession,
    getCachedActivities,
    markSessionUnread,
    clearUnreadForSession,
  } = sessions

  const [messages, setMessages] = useState<HermesMessage[]>([])
  const [contextPressure, setContextPressure] = useState(0)
  const [currentStep, setCurrentStep] = useState(0)
  const [isProcessing, setIsProcessing] = useState(false)
  const streamingMsgRef = useRef<string | null>(null)
  const reasoningRef = useRef("")
  const localMessageIds = useRef<Set<string>>(new Set())
  const recentMessageIds = useRef<Set<string>>(new Set())
  const assistantDedupRef = useRef<Record<string, number>>({})

  const upsertToolInMessage = useCallback((message: HermesMessage, toolCall: ToolCall, replace?: { name: string; status: ToolStatus }) => {
    const toolCalls = [...(message.toolCalls || [])]
    const segments = [...(message.segments || [])]
    if (replace) {
      const tcIdx = toolCalls.findIndex((t) => t.name === replace.name && t.status === replace.status)
      const segIdx = segments.findIndex((seg) => seg.type === "tool" && seg.toolCall.name === replace.name && seg.toolCall.status === replace.status)
      if (tcIdx >= 0) {
        toolCalls[tcIdx] = toolCall
      } else {
        toolCalls.push(toolCall)
      }
      if (segIdx >= 0) {
        segments[segIdx] = { type: "tool", toolCall }
      } else {
        segments.push({ type: "tool", toolCall })
      }
    } else {
      toolCalls.push(toolCall)
      segments.push({ type: "tool", toolCall })
    }
    return { ...message, toolCalls, segments }
  }, [])

  const finishAllTools = useCallback((message: HermesMessage): HermesMessage => {
    const finish = (tc: ToolCall) =>
      tc.status === "running" || tc.status === "preparing" ? { ...tc, status: "success" as ToolStatus } : tc
    return {
      ...message,
      toolCalls: message.toolCalls?.map(finish),
      segments: message.segments?.map((segment) =>
        segment.type === "tool" ? { ...segment, toolCall: finish(segment.toolCall) } : segment,
      ),
    }
  }, [])

  const sendMessage = useCallback((text: string) => {
    if (!text.trim()) return
    const sessionId = getActiveSessionId()
    const trimmed = text.trim()

    if (isProcessing) return
    const ts = Math.floor(Date.now() / 1000)
    localMessageIds.current.add(`${trimmed}-${ts}`)

    const dedupKey = `user-${trimmed}-${Math.floor(Date.now() / 2000)}`
    recentMessageIds.current.add(dedupKey)
    window.setTimeout(() => recentMessageIds.current.delete(dedupKey), 5000)

    const userMessage: HermesMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: trimmed,
      timestamp: now(),
      status: "ready",
    }
    setMessages((prev) => [...prev, userMessage])
    const target = targetToThreadKey(sessionIdToTarget(sessionId))
    sendAction("send_message", { session_id: sessionId, target, text: trimmed })
  }, [getActiveSessionId, isProcessing, sendAction])

  const sendMessageWithAttachments = useCallback(
    (text: string, attachments: { data: string; mime: string }[], displayImages?: string[]) => {
      if (isProcessing) return
      const sessionId = getActiveSessionId()
      const trimmed = text.trim()
      const ts = Math.floor(Date.now() / 1000)
      localMessageIds.current.add(`${trimmed}-${ts}`)
      const dedupKey = `user-${trimmed}-${Math.floor(Date.now() / 2000)}`
      recentMessageIds.current.add(dedupKey)
      window.setTimeout(() => recentMessageIds.current.delete(dedupKey), 5000)

      const userMessage: HermesMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: trimmed,
        timestamp: now(),
        status: "ready",
        images: displayImages,
      }
      setMessages((prev) => [...prev, userMessage])
      const target = targetToThreadKey(sessionIdToTarget(sessionId))
      sendAction("send_message", { session_id: sessionId, target, text: trimmed, images: attachments })
    },
    [getActiveSessionId, isProcessing, sendAction],
  )

  const cancelResponse = useCallback(() => {
    const sessionId = getActiveSessionId()
    sendAction("cancel_response", { session_id: sessionId })
    setIsProcessing(false)
    setMessages((prev) =>
      prev.map((message) =>
        message.status === "streaming"
          ? { ...message, status: "ready" as const, content: message.content || "[Interrupted]" }
          : message,
      ),
    )
    streamingMsgRef.current = null
  }, [getActiveSessionId, sendAction])

  const handleDisconnect = useCallback(() => {
    setIsProcessing(false)
    streamingMsgRef.current = null
    setMessages((prev) =>
      prev.map((message) =>
        message.status === "streaming"
          ? { ...message, status: "ready" as const, content: message.content || "[Connection lost]" }
          : message,
      ),
    )
  }, [])

  const resetConversation = useCallback(() => {
    setMessages([])
    setIsProcessing(false)
    setCurrentStep(0)
    setContextPressure(0)
    streamingMsgRef.current = null
    reasoningRef.current = ""
  }, [])

  const handleConnectionReady = useCallback(
    (event: BridgeEvent) => {
      const runningSessions = (event.running_sessions as string[]) || []
      const sessionId = getActiveSessionId()
      if (runningSessions.includes(sessionId) && !streamingMsgRef.current) {
        const placeholderId = `reconnect-${Date.now()}`
        streamingMsgRef.current = placeholderId
        setIsProcessing(true)
        setMessages((prev) => [
          ...prev,
          {
            id: placeholderId,
            role: "assistant",
            content: "",
            timestamp: now(),
            status: "streaming",
            segments: [],
          },
        ])
      } else if (!runningSessions.includes(sessionId)) {
        setIsProcessing(false)
        streamingMsgRef.current = null
        setMessages((prev) =>
          prev.map((message) =>
            message.status === "streaming" ? { ...finishAllTools(message), status: "ready" as const } : message,
          ),
        )
      }
    },
    [finishAllTools, getActiveSessionId],
  )

  const handleEvent = useCallback(
    (event: BridgeEvent): boolean => {
      switch (event.type) {
        case "message.user": {
          const text = event.text as string
          const msgTimestamp = event.timestamp as number
          const key = `${text}-${Math.floor(msgTimestamp || 0)}`
          if (localMessageIds.current.has(key)) {
            localMessageIds.current.delete(key)
            return true
          }
          const altKey1 = `${text}-${Math.floor((msgTimestamp || 0)) - 1}`
          const altKey2 = `${text}-${Math.floor((msgTimestamp || 0)) + 1}`
          if (localMessageIds.current.has(altKey1)) {
            localMessageIds.current.delete(altKey1)
            return true
          }
          if (localMessageIds.current.has(altKey2)) {
            localMessageIds.current.delete(altKey2)
            return true
          }
          const dedupKey = `user-${text}-${Math.floor(Date.now() / 2000)}`
          if (recentMessageIds.current.has(dedupKey)) return true
          const remoteId = `user-remote-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
          setMessages((prev) => {
            const last = prev[prev.length - 1]
            if (last && last.role === "user" && last.content === text) return prev
            return [...prev, { id: remoteId, role: "user", content: text, timestamp: now(), status: "ready" }]
          })
          return true
        }

        case "response.started": {
          const msgId = `iris-${Date.now()}`
          streamingMsgRef.current = msgId
          reasoningRef.current = ""
          setCurrentStep(0)
          setIsProcessing(true)
          setMessages((prev) => [
            ...prev.map((message) =>
              message.status === "streaming" ? { ...finishAllTools(message), status: "ready" as const } : message,
            ),
            {
              id: msgId,
              role: "assistant",
              content: "",
              timestamp: now(),
              status: "streaming",
              segments: [],
              agentId: (event.agentId as string) || undefined,
            },
          ])
          return true
        }

        case "message.delta": {
          const text = event.text as string
          if (!text || !streamingMsgRef.current) return true
          const currentStreamId = streamingMsgRef.current
          setMessages((prev) =>
            prev.map((message) => {
              if (message.id !== currentStreamId) return message
              const segments = [...(message.segments || [])]
              const lastSegment = segments[segments.length - 1]
              if (lastSegment && lastSegment.type === "text") {
                segments[segments.length - 1] = { ...lastSegment, content: lastSegment.content + text }
              } else {
                segments.push({ type: "text", content: text })
              }
              return { ...message, content: message.content + text, segments }
            }),
          )
          return true
        }

        case "message.delta.end":
          return true

        case "reasoning.delta": {
          const text = event.text as string
          if (!text || !streamingMsgRef.current) return true
          if (!reasoningRef.current.endsWith(text)) {
            reasoningRef.current += text
          }
          const reasoning = reasoningRef.current
          const currentStreamId = streamingMsgRef.current
          setMessages((prev) =>
            prev.map((message) => (message.id === currentStreamId ? { ...message, reasoning } : message)),
          )
          return true
        }

        case "step": {
          updateActivities((prev) =>
            prev.map((activity) =>
              activity.status === "running" || activity.status === "preparing"
                ? { ...activity, status: "success" as const }
                : activity,
            ),
          )
          if (streamingMsgRef.current) {
            const currentStreamId = streamingMsgRef.current
            setMessages((prev) =>
              prev.map((message) => (message.id === currentStreamId ? finishAllTools(message) : message)),
            )
          }
          const step = event.iteration as number
          setCurrentStep(step)
          if (streamingMsgRef.current) {
            const currentStreamId = streamingMsgRef.current
            setMessages((prev) => prev.map((message) => (message.id === currentStreamId ? { ...message, step } : message)))
          }
          return true
        }

        case "response.completed": {
          setIsProcessing(false)
          updateActivities((prev) =>
            prev.map((activity) =>
              activity.status === "running" || activity.status === "preparing"
                ? { ...activity, status: "success" as const }
                : activity,
            ),
          )
          const finalResponse = event.final_response as string
          const completedSessionId = event.session_id as string
          if (completedSessionId && completedSessionId !== getActiveSessionId() && finalResponse) {
            markSessionUnread(completedSessionId)
          }
          if (streamingMsgRef.current) {
            const currentStreamId = streamingMsgRef.current
            setMessages((prev) =>
              prev.map((message) => {
                if (message.id === currentStreamId) {
                  const content = finalResponse || message.content || ""
                  const finished = finishAllTools(message)
                  return { ...finished, content, status: "ready" as const, segments: undefined, agentId: (event.agentId as string) || message.agentId }
                }
                if (message.status === "streaming") return { ...finishAllTools(message), status: "ready" as const }
                return message
              }),
            )
        } else if (finalResponse) {
          const targetSessionId = event.session_id as string | undefined
          const dedupKey = targetSessionId ? `${targetSessionId}:${finalResponse}` : finalResponse
          const nowTs = Date.now()
          const lastSeen = assistantDedupRef.current[dedupKey]
          if (lastSeen && nowTs - lastSeen < 8000) {
            return true
          }
          assistantDedupRef.current[dedupKey] = nowTs
          Object.entries(assistantDedupRef.current).forEach(([key, ts]) => {
            if (nowTs - ts > 30000) delete assistantDedupRef.current[key]
          })
          setMessages((prev) => {
            const lastAssistant = [...prev].reverse().find((message) => message.role === "assistant")
            if (lastAssistant && lastAssistant.content === finalResponse) {
                return prev.map((message) =>
                  message.status === "streaming" ? { ...finishAllTools(message), status: "ready" as const } : message,
                )
              }
              return [
                ...prev.map((message) =>
                  message.status === "streaming" ? { ...finishAllTools(message), status: "ready" as const } : message,
                ),
                {
                  id: `completed-${Date.now()}`,
                  role: "assistant",
                  content: finalResponse,
                  timestamp: now(),
                  status: "ready" as const,
                  agentId: (event.agentId as string) || undefined,
                },
              ]
            })
          }
          streamingMsgRef.current = null
          reasoningRef.current = ""
          return true
        }

        case "response.error": {
          setIsProcessing(false)
          updateActivities((prev) =>
            prev.map((activity) =>
              activity.status === "running" || activity.status === "preparing"
                ? { ...activity, status: "error" as const }
                : activity,
            ),
          )
          const errorText = (event.error as string) || "An error occurred"
          if (streamingMsgRef.current) {
            const currentStreamId = streamingMsgRef.current
            setMessages((prev) =>
              prev.map((message) =>
                message.id === currentStreamId
                  ? { ...message, status: "error" as const, content: message.content || errorText, agentId: (event.agentId as string) || message.agentId }
                  : message,
              ),
            )
            streamingMsgRef.current = null
          } else {
            setMessages((prev) => [
              ...prev,
              {
                id: `error-${Date.now()}`,
                role: "assistant",
                content: errorText,
                timestamp: now(),
                status: "error",
                agentId: (event.agentId as string) || undefined,
              },
            ])
          }
          return true
        }

        case "response.cancelled": {
          setIsProcessing(false)
          if (streamingMsgRef.current) {
            const currentStreamId = streamingMsgRef.current
            setMessages((prev) =>
              prev.map((message) =>
                message.id === currentStreamId
                  ? { ...message, status: "ready" as const, content: message.content || "[Interrupted]" }
                  : message,
              ),
            )
            streamingMsgRef.current = null
          }
          return true
        }

        case "tool.preparing": {
          const toolName = event.tool_name as string
          const prepId = `prep-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
          updateActivities((prev) => {
            const entry: ActivityEntry = {
              id: prepId,
              kind: "tool",
              title: toolName,
              status: "preparing",
              summary: "Preparing...",
              timestamp: now(),
              output: [],
            }
            return [entry, ...prev].slice(0, 20)
          })
          if (streamingMsgRef.current) {
            const currentStreamId = streamingMsgRef.current
            const toolCall: ToolCall = {
              id: prepId,
              name: toolName,
              status: "preparing",
              preview: "Generating arguments...",
              startedAt: now(),
            }
            setMessages((prev) =>
              prev.map((message) => (message.id === currentStreamId ? upsertToolInMessage(message, toolCall) : message)),
            )
          }
          return true
        }

        case "tool.started": {
          const toolId = event.tool_id as string
          const toolName = event.tool_name as string
          const args = event.args as Record<string, unknown> | string | undefined
          const preview = (event.preview as string) || ""
          const toolCall: ToolCall = {
            id: toolId,
            name: toolName,
            status: "running",
            preview,
            args,
            startedAt: now(),
          }
          updateActivities((prev) => {
            const prepIdx = prev.findIndex((activity) => activity.title === toolName && activity.status === "preparing")
            const entry: ActivityEntry = {
              id: toolId,
              kind: "tool",
              title: toolName,
              status: "running",
              summary: preview,
              timestamp: now(),
              output: [],
              args,
            }
            if (prepIdx >= 0) {
              const next = [...prev]
              next[prepIdx] = entry
              return next
            }
            return [entry, ...prev].slice(0, 20)
          })
          if (streamingMsgRef.current) {
            const currentStreamId = streamingMsgRef.current
            setMessages((prev) =>
              prev.map((message) =>
                message.id === currentStreamId
                  ? upsertToolInMessage(message, toolCall, { name: toolName, status: "preparing" })
                  : message,
              ),
            )
          }
          return true
        }

        case "message.image": {
          if (!streamingMsgRef.current) return true
          const imgUrl = event.url as string
          const alt = (event.alt as string) || "Image"
          const host = typeof window !== "undefined" ? window.location.hostname : "127.0.0.1"
          const fullUrl = `http://${host}:8643${imgUrl}`
          const markdown = `\n![${alt}](${fullUrl})\n`
          const currentStreamId = streamingMsgRef.current
          setMessages((prev) =>
            prev.map((message) => {
              if (message.id !== currentStreamId) return message
              const segments = [...(message.segments || [])]
              segments.push({ type: "text", content: markdown } as MessageSegment)
              return { ...message, content: message.content + markdown, segments }
            }),
          )
          return true
        }

        case "memory.updated": {
          const memArgs = event.args as Record<string, unknown> | string | undefined
          const preview = (event.preview as string) || ""
          let summary = preview
          if (memArgs && typeof memArgs === "object") {
            const action = (memArgs.action as string) || ""
            const target = (memArgs.target as string) || ""
            const content = (memArgs.content as string) || (memArgs.old_text as string) || ""
            summary = `${action} → ${target}${content ? `: ${content.slice(0, 120)}` : ""}`
          }
          const memId = `mem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
          updateActivities((prev) => {
            const entry: ActivityEntry = {
              id: memId,
              kind: "memory",
              title: "Memory",
              status: "success",
              summary: summary || preview,
              timestamp: now(),
              output: [],
              args: memArgs && typeof memArgs === "object" ? memArgs : undefined,
            }
            return [entry, ...prev].slice(0, 20)
          })
          if (streamingMsgRef.current) {
            const currentStreamId = streamingMsgRef.current
            const toolCall: ToolCall = {
              id: memId,
              name: "memory",
              status: "success",
              preview: summary,
              args: memArgs,
              startedAt: now(),
            }
            setMessages((prev) =>
              prev.map((message) => (message.id === currentStreamId ? upsertToolInMessage(message, toolCall) : message)),
            )
          }
          return true
        }

        case "subagent.spawned": {
          const preview = (event.preview as string) || "Spawned subagent"
          updateActivities((prev) => {
            const entry: ActivityEntry = {
              id: `subagent-${Date.now()}`,
              kind: "subagent",
              title: preview,
              status: "running",
              summary: preview,
              timestamp: now(),
              output: [],
            }
            return [entry, ...prev].slice(0, 20)
          })
          return true
        }

        case "subagent.progress": {
          const summary = (event.preview as string) || ""
          updateActivities((prev) => {
            const idx = prev.findIndex((activity) => activity.kind === "subagent" && activity.status === "running")
            if (idx === -1) return prev
            const next = [...prev]
            next[idx] = { ...next[idx], summary }
            return next
          })
          return true
        }

        case "status": {
          const eventType = event.event_type as string
          const message = event.message as string
          if (eventType === "context_pressure") {
            const match = message.match(/(\d+)%/)
            if (match) setContextPressure(parseInt(match[1], 10))
          }
          updateActivities((prev) => {
            const entry: ActivityEntry = {
              id: `status-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              kind: "status",
              title: eventType,
              status: "success",
              summary: message,
              timestamp: now(),
              output: [],
            }
            return [entry, ...prev].slice(0, 20)
          })
          return true
        }

        case "session.divider_inserted": {
          const sessionId = event.session_id as string
          const dividerText = event.text as string
          if (sessionId !== getActiveSessionId() || !dividerText) return true
          setMessages((prev) => [
            ...prev,
            {
              id: `divider-${Date.now()}`,
              role: "divider",
              content: dividerText,
              timestamp: now(),
              status: "ready",
            },
          ])
          return true
        }

        case "session.created": {
          const newSessionId = event.session_id as string
          setActiveSessionFromEvent(newSessionId)
          setContextPressure(0)
          setCurrentStep(0)
          streamingMsgRef.current = null
          reasoningRef.current = ""
          setIsProcessing(false)
          sendAction("list_sessions")
          return true
        }

        case "hermes.message": {
          const sessionId = event.session_id as string
          const text = event.text as string
          if (sessionId && sessionId !== getActiveSessionId()) {
            markSessionUnread(sessionId)
          }
          if (sessionId !== getActiveSessionId() || !text) return true
          const dedupKey = `${sessionId}:${text}`
          const nowTs = Date.now()
          const lastSeen = assistantDedupRef.current[dedupKey]
          if (lastSeen && nowTs - lastSeen < 8000) {
            return true
          }
          assistantDedupRef.current[dedupKey] = nowTs
          Object.entries(assistantDedupRef.current).forEach(([key, ts]) => {
            if (nowTs - ts > 30000) delete assistantDedupRef.current[key]
          })
          setMessages((prev) => {
            const last = prev[prev.length - 1]
            if (last && last.role === "assistant" && last.content === text) return prev
            return [
              ...prev,
              {
                id: `hermes-${Date.now()}`,
                role: "assistant",
                content: text,
                timestamp: now(),
                status: "ready",
                agentId: (event.agentId as string) || undefined,
              },
            ]
          })
          sendAction("list_sessions")
          return true
        }

        case "session.resumed": {
          const resumedSessionId = event.session_id as string
          const historyMsgs = (event.messages as { role: string; content: string; timestamp: string; agentId?: string }[]) || []
          setActiveSessionFromEvent(resumedSessionId)
          clearUnreadForSession(resumedSessionId)
          const serverActivities = event.activities as Record<string, unknown>[] | undefined
          const restoredActivities =
            serverActivities && serverActivities.length > 0
              ? serverActivities.map((activity, idx) => ({
                  id: (activity.id as string) || `restored-${idx}-${Date.now()}`,
                  kind: ((activity.kind as string) || (activity.type as string)?.split(".")[0] || "tool") as ActivityEntry["kind"],
                  title: (activity.title as string) || (activity.tool_name as string) || (activity.type as string) || "Event",
                  status: "success" as const,
                  summary: (activity.summary as string) || "",
                  timestamp: activity.timestamp
                    ? new Date((activity.timestamp as number) * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                    : "",
                  output: (activity.output as string[]) || [],
                  args: (activity.args as Record<string, unknown>) || undefined,
                }))
              : getCachedActivities(resumedSessionId)
          setActivitiesForSession(resumedSessionId, restoredActivities as ActivityEntry[])
          setContextPressure(0)
          setCurrentStep(0)
          const restoredMessages: HermesMessage[] = historyMsgs.map((msg, idx) => ({
            id: `history-${idx}-${Date.now()}`,
            role: msg.role as "user" | "assistant" | "divider",
            content: msg.content || "",
            timestamp: msg.timestamp ? now() : "",
            status: "ready",
            agentId: msg.agentId,
          }))
          const runningSessions = (event.running_sessions as string[]) || []
          const isRunning = runningSessions.includes(resumedSessionId)
          if (isRunning) {
            const placeholderId = streamingMsgRef.current || `reconnect-${Date.now()}`
            streamingMsgRef.current = placeholderId
            setIsProcessing(true)
            setMessages([
              ...restoredMessages,
              { id: placeholderId, role: "assistant", content: "", timestamp: now(), status: "streaming" },
            ])
          } else {
            setIsProcessing(false)
            streamingMsgRef.current = null
            reasoningRef.current = ""
            setMessages(restoredMessages)
          }
          return true
        }

        case "hermes.nudge":
          return true

        default:
          return false
      }
    },
    [
      clearUnreadForSession,
      finishAllTools,
      getActiveSessionId,
      getCachedActivities,
      markSessionUnread,
      sendAction,
      setActiveSessionFromEvent,
      setActivitiesForSession,
      updateActivities,
    ],
  )

  return {
    messages,
    contextPressure,
    currentStep,
    isProcessing,
    sendMessage,
    sendMessageWithAttachments,
    cancelResponse,
    handleEvent,
    handleConnectionReady,
    handleDisconnect,
    resetConversation,
  }
}
