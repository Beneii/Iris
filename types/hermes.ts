/**
 * Shared types for Hermes bridge communication.
 *
 * Canonical types used by use-hermes-bridge.ts and all components.
 * If you need a type for Hermes data, check here first.
 */

export type ToolStatus = "preparing" | "running" | "success" | "error" | "pending"

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
  role: "user" | "assistant" | "divider"
  content: string
  timestamp: string
  status: "ready" | "streaming" | "error"
  reasoning?: string
  step?: number
  toolCalls?: ToolCall[]
  segments?: MessageSegment[]
  images?: string[]
  agentId?: string
  reaction?: "thumbsup" | "thumbsdown" | null
}

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

export type ConnectionState = "connecting" | "connected" | "disconnected"

export type BridgeEvent = {
  type: string
  [key: string]: unknown
}

export type LiveAgentData = {
  id: string
  name: string
  model: string
  provider: string
  status: string
  memorySize: number
  skillCount: number
  messageCount: number
  lastActive: number
}

export type QueueStatus = Record<string, {
  depth: number
  currentJobId: string | null
  currentSessionId: string | null
}>

export type AgentHealth = {
  profile: string
  alive: boolean
  cached_sessions?: number
  uptime?: number
  timeout?: boolean
}

export type Project = {
  id: string
  name: string
  description: string
  created_at: number
  updated_at: number
  session_ids: string[]
  agent_ids: string[]
  tags: string[]
  status: "active" | "paused" | "completed" | "archived"
}

export const HOME_SESSION_ID = "home"

/* ─── Target-first routing ─── */

export const AGENT_IDS = new Set(["hermes", "talos", "icarus", "charon", "nyx"])

export type ConversationTarget =
  | { kind: "dm"; agentId: string }
  | { kind: "channel"; channelId: string }

export type ThreadKey = `dm:${string}` | `channel:${string}`

export function targetToThreadKey(target: ConversationTarget): ThreadKey {
  return target.kind === "dm" ? `dm:${target.agentId}` : `channel:${target.channelId}`
}

export function threadKeyToSessionId(key: ThreadKey): string {
  const [kind, id] = key.split(":", 2)
  if (kind === "dm") return id === "hermes" ? HOME_SESSION_ID : id
  return id
}

export function sessionIdToTarget(sessionId: string): ConversationTarget {
  if (sessionId === HOME_SESSION_ID) return { kind: "dm", agentId: "hermes" }
  if (AGENT_IDS.has(sessionId)) return { kind: "dm", agentId: sessionId }
  return { kind: "channel", channelId: sessionId }
}
