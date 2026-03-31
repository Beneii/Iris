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
  icon: string
  color: string        // pastel accent color
  description: string
  memorySize?: number
  skillCount?: number
  lastActive?: number
  currentTask?: string
}

/* ─── Default Agents ─── */
export const DEFAULT_AGENTS: PantheonAgent[] = [
  {
    id: "hermes",
    name: "Hermes",
    role: "Orchestrator",
    model: "claude-opus-4",
    status: "running",
    icon: "☤",
    color: "#B8C7E0",     // cool silver-blue
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
    color: "#E0C4A8",     // warm bronze
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
    color: "#F2D48A",     // golden amber
    description: "Fast and risky. Prototyping, creative drafts, things that might fail.",
  },
  {
    id: "charon",
    name: "Charon",
    role: "Research",
    model: "deepseek-r1",
    status: "idle",
    icon: "◈",
    color: "#A8D8C8",     // sage green
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
    color: "#C4B0D8",     // soft lavender
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
  idle: { color: "rgba(255,255,255,0.15)", className: "" },
  error: { color: "#EF4444", className: "dot-error" },
  offline: { color: "rgba(255,255,255,0.06)", className: "" },
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
      {/* Header — matches main header: env(safe-area-inset-top) + 2px progress + 52px row */}
      <div style={{
        paddingTop: "env(safe-area-inset-top)",
        borderBottom: "1px solid var(--color-border-dim)",
        flexShrink: 0,
      }}>
        {/* Spacer matching progress bar height */}
        <div style={{ height: 2 }} />
        {/* Content row matching main header 52px */}
        <div style={{
          height: 52,
          display: "flex",
          alignItems: "center",
          padding: "0 16px",
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
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {selected ? (
          /* ─── Detail View ─── */
          <div style={{ flex: 1, overflow: "auto", padding: "16px" }}>
            <button
              onClick={() => setSelectedId(null)}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "rgba(255,255,255,0.3)",
                fontSize: 12,
                padding: "4px 0",
                marginBottom: 20,
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <span style={{ fontSize: 14 }}>←</span> Back
            </button>

            {/* Agent header */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
              <span style={{ fontSize: 28, color: selected.color, lineHeight: 1 }}>
                {selected.icon}
              </span>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: selected.color }}>
                  {selected.name}
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
                  {selected.role}
                </div>
              </div>
            </div>

            <div style={{
              fontSize: 12,
              color: "rgba(255,255,255,0.35)",
              lineHeight: 1.5,
              marginBottom: 24,
            }}>
              {selected.description}
            </div>

            {/* Meta */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28 }}>
              {[
                { label: "Model", value: selected.model },
                { label: "Status", value: selected.status },
                ...(selected.memorySize ? [{ label: "Memory", value: `${selected.memorySize} entries` }] : []),
                ...(selected.skillCount ? [{ label: "Skills", value: `${selected.skillCount}` }] : []),
              ].map(row => (
                <div key={row.label} style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.18)" }}>{row.label}</span>
                  <span style={{
                    fontSize: 11,
                    color: "rgba(255,255,255,0.45)",
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
                  border: `1px solid ${selected.color}22`,
                  background: `${selected.color}08`,
                  color: selected.color,
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "background 150ms ease, border-color 150ms ease",
                  opacity: 0.7,
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.opacity = "1"
                  e.currentTarget.style.background = `${selected.color}12`
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.opacity = "0.7"
                  e.currentTarget.style.background = `${selected.color}08`
                }}
              >
                Message {selected.name}
              </button>
            )}
          </div>
        ) : (
          /* ─── Agent List ─── */
          <div style={{ flex: 1, overflow: "auto", padding: "8px 8px" }}>
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
                    padding: "10px 8px",
                    borderRadius: 8,
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left" as const,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.03)" }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent" }}
                >
                  {/* Icon — no box, just the symbol */}
                  <span style={{
                    fontSize: 20,
                    color: agent.color,
                    width: 24,
                    textAlign: "center" as const,
                    flexShrink: 0,
                    lineHeight: 1,
                  }}>
                    {agent.icon}
                  </span>

                  {/* Name + role */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: agent.color,
                      lineHeight: 1.3,
                    }}>
                      {agent.name}
                    </div>
                    <div style={{
                      fontSize: 10,
                      color: "rgba(255,255,255,0.18)",
                      lineHeight: 1.3,
                    }}>
                      {agent.model}
                    </div>
                  </div>

                  {/* Status dot */}
                  <span
                    className={dot.className}
                    style={{
                      width: 5,
                      height: 5,
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
