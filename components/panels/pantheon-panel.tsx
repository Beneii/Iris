"use client"

import * as React from "react"

/* ─── Agent Types ─── */
export type AgentStatus = "idle" | "running" | "error" | "offline"

export type PantheonAgent = {
  id: string
  name: string
  role: string
  model: string
  status: AgentStatus
  icon: string         // unicode symbol
  description: string
  memorySize?: number  // entries
  skillCount?: number
  lastActive?: number  // unix timestamp
  currentTask?: string
}

/* ─── Default Pantheon ─── */
export const DEFAULT_AGENTS: PantheonAgent[] = [
  {
    id: "hermes",
    name: "Hermes",
    role: "Orchestrator",
    model: "claude-opus-4",
    status: "running",
    icon: "☤",
    description: "Primary agent. Routes tasks, manages memory, coordinates the pantheon.",
    memorySize: 42,
    skillCount: 108,
  },
  {
    id: "talos",
    name: "Talos",
    role: "Builder",
    model: "claude-code",
    status: "idle",
    icon: "⚙",
    description: "Pure code execution. Writes, refactors, debugs. No opinions, just builds.",
    skillCount: 12,
  },
  {
    id: "icarus",
    name: "Icarus",
    role: "Experimental",
    model: "local · llama",
    status: "idle",
    icon: "△",
    description: "Fast and risky. Prototyping, creative drafts, things that might fail.",
  },
  {
    id: "charon",
    name: "Charon",
    role: "Research",
    model: "deepseek-r1",
    status: "idle",
    icon: "◈",
    description: "Ferries data from the other side. Web research, API calls, document processing.",
    skillCount: 8,
  },
  {
    id: "nyx",
    name: "Nyx",
    role: "Daemon",
    model: "local · qwen",
    status: "idle",
    icon: "◑",
    description: "Background operations. Self-improvement, memory decay, monitoring, cron.",
  },
]

/* ─── Props ─── */
interface PantheonPanelProps {
  agents?: PantheonAgent[]
  isProcessing?: boolean
  isMobile?: boolean
  onAgentClick?: (agent: PantheonAgent) => void
  onMessageAgent?: (agent: PantheonAgent) => void
}

/* ─── Status styling ─── */
const STATUS_DOT: Record<AgentStatus, { color: string; className: string }> = {
  running: { color: "#34C759", className: "dot-running" },
  idle: { color: "rgba(255,255,255,0.2)", className: "" },
  error: { color: "#EF4444", className: "dot-error" },
  offline: { color: "rgba(255,255,255,0.08)", className: "" },
}

/* ─── Component ─── */
export default function PantheonPanel({
  agents = DEFAULT_AGENTS,
  isProcessing = false,
  onAgentClick,
  onMessageAgent,
}: PantheonPanelProps) {
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const selected = agents.find(a => a.id === selectedId)

  // When Hermes is processing, reflect that
  const liveAgents = React.useMemo(() => {
    return agents.map(a => a.id === "hermes" && isProcessing ? { ...a, status: "running" as AgentStatus } : a)
  }, [agents, isProcessing])

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
      background: "var(--color-surface)",
      borderLeft: "1px solid var(--color-border-dim)",
    }}>
      {/* Header */}
      <div style={{
        padding: "0 16px",
        height: 52,
        display: "flex",
        alignItems: "center",
        borderBottom: "1px solid var(--color-border-dim)",
        flexShrink: 0,
      }}>
        <span style={{
          fontSize: 10,
          fontWeight: 600,
          textTransform: "uppercase" as const,
          letterSpacing: "0.08em",
          color: "rgba(255,255,255,0.25)",
        }}>
          Agents
        </span>
      </div>

      {/* Agent list or detail view */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {selected ? (
          /* ─── Detail View ─── */
          <div style={{ flex: 1, overflow: "auto", padding: "16px" }}>
            {/* Back */}
            <button
              onClick={() => setSelectedId(null)}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "rgba(255,255,255,0.3)",
                fontSize: 12,
                padding: "4px 0",
                marginBottom: 16,
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <span style={{ fontSize: 14 }}>←</span> Back
            </button>

            {/* Agent header */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
              <div style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.06)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 18,
              }}>
                {selected.icon}
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>
                  {selected.name}
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
                  {selected.role}
                </div>
              </div>
            </div>

            {/* Description */}
            <div style={{
              fontSize: 12,
              color: "rgba(255,255,255,0.4)",
              lineHeight: 1.5,
              marginBottom: 20,
            }}>
              {selected.description}
            </div>

            {/* Meta */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
              {[
                { label: "Model", value: selected.model },
                { label: "Status", value: selected.status },
                ...(selected.memorySize ? [{ label: "Memory", value: `${selected.memorySize} entries` }] : []),
                ...(selected.skillCount ? [{ label: "Skills", value: `${selected.skillCount}` }] : []),
              ].map(row => (
                <div key={row.label} style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>{row.label}</span>
                  <span style={{
                    fontSize: 11,
                    color: "rgba(255,255,255,0.5)",
                    fontFamily: "var(--font-geist-mono), monospace",
                  }}>
                    {row.value}
                  </span>
                </div>
              ))}
            </div>

            {/* Message button */}
            {onMessageAgent && selected.id !== "hermes" && (
              <button
                onClick={() => onMessageAgent(selected)}
                style={{
                  width: "100%",
                  padding: "8px 0",
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.03)",
                  color: "rgba(255,255,255,0.5)",
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "background 150ms ease, border-color 150ms ease",
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.06)"
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.03)"
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"
                }}
              >
                Message {selected.name}
              </button>
            )}
          </div>
        ) : (
          /* ─── Agent List ─── */
          <div style={{ flex: 1, overflow: "auto", padding: "8px" }}>
            {liveAgents.map(agent => {
              const dot = STATUS_DOT[agent.status]
              return (
                <button
                  key={agent.id}
                  onClick={() => {
                    setSelectedId(agent.id)
                    onAgentClick?.(agent)
                  }}
                  className="session-row"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: 8,
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left" as const,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.03)" }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent" }}
                >
                  {/* Icon */}
                  <div style={{
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.05)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 14,
                    flexShrink: 0,
                  }}>
                    {agent.icon}
                  </div>

                  {/* Name + role */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: "rgba(255,255,255,0.7)",
                      lineHeight: 1.3,
                    }}>
                      {agent.name}
                    </div>
                    <div style={{
                      fontSize: 10,
                      color: "rgba(255,255,255,0.2)",
                      lineHeight: 1.3,
                    }}>
                      {agent.role} · {agent.model}
                    </div>
                  </div>

                  {/* Status dot */}
                  <span
                    className={dot.className}
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: dot.color,
                      flexShrink: 0,
                    }}
                  />
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
