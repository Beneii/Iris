export type HermesMessageRole = "user" | "assistant"

export type HermesMessage = {
  id: string
  role: HermesMessageRole
  content: string
  timestamp: string
  status?: "ready" | "streaming" | "error"
}

export type ToolStatus = "running" | "success" | "error" | "pending"

export type HermesActivityEntry = {
  id: string
  kind:
    | "tool"
    | "memory"
    | "compaction"
    | "approval"
    | "mcp"
  title: string
  status: ToolStatus
  summary: string
  timestamp: string
  output: string[]
  toolName?: string
  icon?: string
}

export type HermesSession = {
  id: string
  title: string
  subtitle: string
  lastEventAt: string
  status: "active" | "idle" | "archived"
  unread?: number
}

export type HermesRuntimeEvent =
  | {
      type: "response.started"
      messageId: string
      timestamp: string
      delay?: number
    }
  | {
      type: "response.delta"
      messageId: string
      chunk: string
      delay?: number
    }
  | {
      type: "response.completed"
      messageId: string
      delay?: number
    }
  | {
      type: "tool.started"
      toolId: string
      toolName: string
      icon?: string
      summary: string
      timestamp: string
      delay?: number
    }
  | {
      type: "tool.stdout"
      toolId: string
      data: string
      delay?: number
    }
  | {
      type: "tool.finished"
      toolId: string
      result: string
      delay?: number
    }
  | {
      type: "tool.failed"
      toolId: string
      error: string
      delay?: number
    }
  | {
      type: "memory.updated"
      id: string
      detail: string
      delay?: number
    }
  | {
      type: "compaction.performed"
      id: string
      tokensFreed: number
      delay?: number
    }
  | {
      type: "approval.requested"
      id: string
      detail: string
      delay?: number
    }
  | {
      type: "mcp.session.updated"
      id: string
      detail: string
      delay?: number
    }
