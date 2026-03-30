"use client"

import * as React from "react"

import { initialMessages, mockEventTimeline } from "@/lib/mock-data"
import type {
  HermesActivityEntry,
  HermesMessage,
  HermesRuntimeEvent,
} from "@/types/hermes"

type UseMockHermesStreamReturn = {
  messages: HermesMessage[]
  activities: HermesActivityEntry[]
  contextUsage: number
  sendUserMessage: (content: string) => void
  restartStream: () => void
}

export function useMockHermesStream(): UseMockHermesStreamReturn {
  const [messages, setMessages] = React.useState<HermesMessage[]>(
    () => structuredClone(initialMessages) as HermesMessage[]
  )
  const [activities, setActivities] = React.useState<HermesActivityEntry[]>([])
  const [contextUsage, setContextUsage] = React.useState(32)
  const timeoutRef = React.useRef<NodeJS.Timeout | null>(null)
  const streamIndexRef = React.useRef(0)

  const processEvent = React.useCallback((event: HermesRuntimeEvent) => {
    switch (event.type) {
      case "response.started": {
        setMessages((prev) => [
          ...prev,
          {
            id: event.messageId,
            role: "assistant",
            content: "",
            timestamp: event.timestamp,
            status: "streaming",
          },
        ])
        break
      }
      case "response.delta": {
        setMessages((prev) =>
          prev.map((message) =>
            message.id === event.messageId
              ? {
                  ...message,
                  content: `${message.content}${event.chunk}`,
                }
              : message
          )
        )
        setContextUsage((value) => Math.min(96, value + 1))
        break
      }
      case "response.completed": {
        setMessages((prev) =>
          prev.map((message) =>
            message.id === event.messageId
              ? { ...message, status: "ready" }
              : message
          )
        )
        break
      }
      case "tool.started": {
        setActivities((prev) => {
          const next: HermesActivityEntry[] = [
            {
              id: event.toolId,
              kind: "tool",
              title: event.toolName,
              summary: event.summary,
              status: "running",
              timestamp: event.timestamp,
              output: [],
              icon: event.icon ?? "terminal",
            },
            ...prev.filter((item) => item.id !== event.toolId),
          ]
          return next.slice(0, 8)
        })
        setContextUsage((value) => Math.min(96, value + 2))
        break
      }
      case "tool.stdout": {
        setActivities((prev) =>
          prev.map((item) =>
            item.id === event.toolId
              ? { ...item, output: [...item.output, event.data] }
              : item
          )
        )
        break
      }
      case "tool.finished": {
        setActivities((prev) =>
          prev.map((item) =>
            item.id === event.toolId
              ? {
                  ...item,
                  status: "success",
                  summary: event.result,
                }
              : item
          )
        )
        break
      }
      case "tool.failed": {
        setActivities((prev) =>
          prev.map((item) =>
            item.id === event.toolId
              ? {
                  ...item,
                  status: "error",
                  summary: event.error,
                }
              : item
          )
        )
        break
      }
      case "memory.updated": {
        setActivities((prev) => {
          const entry: HermesActivityEntry = {
            id: event.id,
            kind: "memory",
            title: "Memory updated",
            summary: event.detail,
            status: "success",
            timestamp: "Now",
            output: [event.detail],
            icon: "brain",
          }
          return [entry, ...prev].slice(0, 8)
        })
        setContextUsage((value) => Math.max(8, value - 5))
        break
      }
      case "compaction.performed": {
        setActivities((prev) => {
          const entry: HermesActivityEntry = {
            id: event.id,
            kind: "compaction",
            title: "Context compaction",
            summary: `Freed ${event.tokensFreed.toLocaleString()} tokens`,
            status: "success",
            timestamp: "Now",
            output: [`Compression sweep released ${event.tokensFreed} tokens.`],
            icon: "layers",
          }
          return [entry, ...prev].slice(0, 8)
        })
        setContextUsage((value) =>
          Math.max(4, value - Math.round(event.tokensFreed / 200))
        )
        break
      }
      case "approval.requested": {
        setActivities((prev) => {
          const entry: HermesActivityEntry = {
            id: event.id,
            kind: "approval",
            title: "Approval needed",
            summary: event.detail,
            status: "pending",
            timestamp: "Now",
            output: [event.detail],
            icon: "shield",
          }
          return [entry, ...prev].slice(0, 8)
        })
        break
      }
      case "mcp.session.updated": {
        setActivities((prev) => {
          const entry: HermesActivityEntry = {
            id: event.id,
            kind: "mcp",
            title: "MCP session",
            summary: event.detail,
            status: "success",
            timestamp: "Now",
            output: [event.detail],
            icon: "sparkles",
          }
          return [entry, ...prev].slice(0, 8)
        })
        break
      }
    }
  }, [])

  const step = React.useCallback(
    (index: number) => {
      const processNext = (currentIndex: number) => {
        if (currentIndex >= mockEventTimeline.length) {
          return
        }

        const event = mockEventTimeline[currentIndex]
        processEvent(event)

        const delay = event.delay ?? 900
        timeoutRef.current = setTimeout(() => {
          streamIndexRef.current = currentIndex + 1
          processNext(currentIndex + 1)
        }, delay)
      }

      processNext(index)
    },
    [processEvent]
  )

  React.useEffect(() => {
    step(0)
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [step])

  const sendUserMessage = React.useCallback((content: string) => {
    const timestamp = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })

    const userMessage: HermesMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content,
      timestamp,
      status: "ready",
    }

    setMessages((prev) => [...prev, userMessage])
  }, [])

  const restartStream = React.useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    setMessages(structuredClone(initialMessages) as HermesMessage[])
    setActivities([])
    setContextUsage(28)
    streamIndexRef.current = 0
    step(0)
  }, [step])

  return {
    messages,
    activities,
    contextUsage,
    sendUserMessage,
    restartStream,
  }
}
