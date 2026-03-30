import type {
  HermesMessage,
  HermesRuntimeEvent,
  HermesSession,
} from "@/types/hermes"

export const mockSessions: HermesSession[] = [
  {
    id: "session-01",
    title: "Ops Briefing",
    subtitle: "Factory uptime + vendor deltas",
    lastEventAt: "09:18",
    status: "active",
    unread: 2,
  },
  {
    id: "session-02",
    title: "Agency Pitch Deck",
    subtitle: "Storyboard & moodboards",
    lastEventAt: "08:57",
    status: "idle",
  },
  {
    id: "session-03",
    title: "Agent QA Lab",
    subtitle: "Regression on Hermes tools",
    lastEventAt: "Yesterday",
    status: "idle",
  },
  {
    id: "session-04",
    title: "Procurement Sweep",
    subtitle: "Monitor supplier emails",
    lastEventAt: "Mar 12",
    status: "archived",
  },
  {
    id: "session-05",
    title: "Personal Scratchpad",
    subtitle: "Ideas + experiments",
    lastEventAt: "Mar 10",
    status: "archived",
  },
]

export const initialMessages: HermesMessage[] = [
  {
    id: "m-1",
    role: "user",
    content:
      "Hermes, audit the overnight build logs and flag anything that would block today's deploy window.",
    timestamp: "09:36",
    status: "ready",
  },
  {
    id: "m-2",
    role: "assistant",
    content:
      "On it. Pulling the cron output, MCP heartbeat, and the latest deployment artifacts now.",
    timestamp: "09:36",
    status: "ready",
  },
]

export const mockEventTimeline: HermesRuntimeEvent[] = [
  {
    type: "response.started",
    messageId: "m-3",
    timestamp: "09:37",
    delay: 600,
  },
  {
    type: "response.delta",
    messageId: "m-3",
    chunk: "Found divergent checksum on the analytics worker. Verifying if it's benign ",
    delay: 500,
  },
  {
    type: "tool.started",
    toolId: "tool-01",
    toolName: "diagnostics.exec",
    summary: "Collecting docker stats",
    timestamp: "09:37",
    icon: "cpu",
    delay: 500,
  },
  {
    type: "tool.stdout",
    toolId: "tool-01",
    data: "docker stats --no-stream hermes-worker",
    delay: 400,
  },
  {
    type: "tool.stdout",
    toolId: "tool-01",
    data: "CPU 72% | MEM 3.1 GiB | NET 128 MB/s",
    delay: 700,
  },
  {
    type: "tool.finished",
    toolId: "tool-01",
    result: "Worker stabilized after cache eviction",
    delay: 500,
  },
  {
    type: "response.delta",
    messageId: "m-3",
    chunk: "and confirming cache busted successfully. Pulling incidents from PagerDuty… ",
    delay: 600,
  },
  {
    type: "tool.started",
    toolId: "tool-02",
    toolName: "pagerduty.query",
    summary: "Scan oncall timeline",
    timestamp: "09:38",
    icon: "radar",
    delay: 700,
  },
  {
    type: "tool.stdout",
    toolId: "tool-02",
    data: "No blocking incidents in last 6h",
    delay: 600,
  },
  {
    type: "tool.failed",
    toolId: "tool-02",
    error: "API throttled; reusing cached digest",
    delay: 600,
  },
  {
    type: "memory.updated",
    id: "mem-01",
    detail: "Logged cache-eviction heuristic v5",
    delay: 500,
  },
  {
    type: "compaction.performed",
    id: "cmp-01",
    tokensFreed: 2400,
    delay: 700,
  },
  {
    type: "approval.requested",
    id: "appr-01",
    detail: "OK to restart telemetry collector?",
    delay: 900,
  },
  {
    type: "response.delta",
    messageId: "m-3",
    chunk: "ready to restart telemetry if you approve. Everything else looks green.",
    delay: 600,
  },
  {
    type: "response.completed",
    messageId: "m-3",
    delay: 500,
  },
  {
    type: "mcp.session.updated",
    id: "mcp-01",
    detail: "Connected to shadcn MCP for UI sync",
    delay: 600,
  },
]
