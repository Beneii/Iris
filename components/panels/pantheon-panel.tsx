"use client"

import * as React from "react"
import { X } from "lucide-react"
import { HOME_SESSION_ID, type QueueStatus } from "@/types/hermes"

/* ─── Agent Types ─── */
export type AgentStatus = "idle" | "running" | "error" | "offline"

export type PantheonAgent = {
  id: string
  name: string
  role: string
  model: string
  status: AgentStatus
  icon: string         // SVG path under /agents/ (e.g. "hermes") or unicode fallback
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
    status: "idle",
    icon: "hermes",
    color: "#5BA4F6",
    description: "Primary agent. Routes tasks, manages memory, coordinates the pantheon.",
  },
  {
    id: "talos",
    name: "Talos",
    role: "Builder",
    model: "claude-opus-4-6",
    status: "idle",
    icon: "talos",
    color: "#E8853D",
    description: "Pure code execution. Writes, refactors, debugs. No opinions, just builds.",
  },
  {
    id: "icarus",
    name: "Icarus",
    role: "Experimental",
    model: "claude-opus-4-6",
    status: "idle",
    icon: "icarus",
    color: "#F5C842",
    description: "Fast and risky. Prototyping, creative drafts, things that might fail.",
  },
  {
    id: "charon",
    name: "Charon",
    role: "Research",
    model: "claude-opus-4-6",
    status: "idle",
    icon: "charon",
    color: "#34C759",
    description: "Ferries data from the other side. Web research, API calls, document processing.",
  },
  {
    id: "nyx",
    name: "Nyx",
    role: "Daemon",
    model: "claude-opus-4-6",
    status: "idle",
    icon: "nyx",
    color: "#A855F7",
    description: "Background operations. Self-improvement, memory decay, monitoring, cron.",
  },
]

/* ─── Live agent data from bridge ─── */
type LiveAgentData = {
  id: string
  name: string
  model: string
  provider: string
  status: string
  memorySize: number
  skillCount: number
  messageCount: number
  lastActive: number
  restartCount?: number
  lastError?: string | null
  mode?: string
}

/* ─── Props ─── */
interface PantheonPanelProps {
  agents?: PantheonAgent[]
  isProcessing?: boolean
  activeSessionId?: string
  isMobile?: boolean
  liveAgents?: LiveAgentData[] | null
  queueStatus?: QueueStatus
  sessionRoster?: string[]
  onAgentClick?: (agent: PantheonAgent) => void
  onOpenDM?: (agentId: string) => void
}

/* ─── Agent Icon (colored dot) ─── */
export function AgentIcon({ agent, size = 16 }: { agent: PantheonAgent; size?: number }) {
  return (
    <div
      aria-label={agent.name}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: agent.color,
        flexShrink: 0,
      }}
    />
  )
}

/* ─── Status styling ─── */
const STATUS_META: Record<AgentStatus, { color: string; className: string; label: string }> = {
  running: { color: "var(--color-status-success)", className: "dot-running", label: "Active" },
  idle:    { color: "var(--color-status-warning)", className: "", label: "Idle" },
  error:   { color: "var(--color-status-error)", className: "dot-error", label: "Busy" },
  offline: { color: "var(--color-text-quaternary)", className: "", label: "Offline" },
}

/* ─── Agent Profile Card (Discord-style popout) ─── */
export function AgentPopout({
  agent,
  onClose,
  onOpenDM,
  onRestart,
}: {
  agent: PantheonAgent
  onClose: () => void
  onOpenDM?: (agentId: string) => void
  onRestart?: (agentId: string) => void
}) {
  if (!agent) return null
  const modalRef = React.useRef<HTMLDivElement>(null)
  const meta = STATUS_META[agent.status]

  React.useEffect(() => { modalRef.current?.focus() }, [])

  return (
    <>
      {/* Click-off layer (transparent, no blur) */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 60,
        }}
      />

      {/* Card */}
      <div
        ref={modalRef}
        role="dialog"
        aria-label={`${agent.name} profile`}
        tabIndex={-1}
        onKeyDown={(e) => { if (e.key === "Escape") onClose() }}
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 360,
          maxWidth: "90vw",
          background: "var(--color-elevated)",
          borderRadius: 12,
          border: "1px solid var(--color-border-dim)",
          zIndex: 70,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          outline: "none",
          boxShadow: "0 24px 80px rgba(0,0,0,0.5)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Banner accent */}
        <div style={{ height: 4, background: agent.color, opacity: 0.6 }} />

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 20px 0" }}>
          <AgentIcon agent={agent} size={8} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: agent.color }}>{agent.name}</div>
            <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", display: "flex", alignItems: "center", gap: 6 }}>
              <span>{agent.role}</span>
              <span style={{ color: "var(--color-border-subtle)" }}>·</span>
              <span style={{ fontFamily: "var(--font-geist-mono), monospace", fontSize: 10 }}>{agent.model}</span>
            </div>
          </div>
          <button
            aria-label="Close"
            onClick={onClose}
            style={{ background: "transparent", border: "none", cursor: "pointer", padding: 6, color: "var(--color-text-ghost)", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>

        {/* Status */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 20px" }}>
          <span className={meta.className} style={{ width: 6, height: 6, borderRadius: "50%", background: meta.color, flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontWeight: 500, color: agent.status === "running" ? "var(--color-status-success)" : "var(--color-text-ghost)" }}>
            {meta.label}
          </span>
          {agent.currentTask && (
            <>
              <span style={{ color: "var(--color-border-subtle)" }}>·</span>
              <span style={{ fontSize: 11, color: "var(--color-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{agent.currentTask}</span>
            </>
          )}
        </div>

        {/* Description */}
        <div style={{ padding: "0 20px 12px" }}>
          <p style={{ fontSize: 12, color: "var(--color-text-tertiary)", lineHeight: 1.6, margin: 0 }}>
            {agent.description}
          </p>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, padding: "0 20px 16px" }}>
          {[
            { label: "Model", value: agent.model },
            { label: "Memory", value: agent.memorySize ? `${agent.memorySize} entries` : "—" },
            { label: "Skills", value: agent.skillCount ? `${agent.skillCount}` : "—" },
            { label: "Last active", value: agent.lastActive ? new Date(agent.lastActive * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—" },
          ].map(row => (
            <div key={row.label} style={{ padding: "8px 10px", background: "var(--color-hover-bg)", borderRadius: 6 }}>
              <div style={{ fontSize: 9, fontWeight: 600, color: "var(--color-text-faint)", textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 3 }}>{row.label}</div>
              <div style={{ fontSize: 11, color: "var(--color-text-secondary)", fontFamily: "var(--font-geist-mono), monospace" }}>{row.value}</div>
            </div>
          ))}
        </div>

        {/* Open DMs button */}
        <div style={{ padding: "0 20px 16px" }}>
          <button
            onClick={() => { onOpenDM?.(agent.id); onClose() }}
            style={{
              width: "100%",
              padding: "10px 0",
              borderRadius: 8,
              border: "none",
              background: agent.color,
              color: "#111",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              transition: "opacity 150ms ease",
            }}
            onMouseEnter={e => { e.currentTarget.style.opacity = "0.85" }}
            onMouseLeave={e => { e.currentTarget.style.opacity = "1" }}
          >
            Open DMs with {agent.name}
          </button>
          {onRestart && (
            <button
              onClick={() => { onRestart(agent.id); onClose() }}
              style={{
                width: "100%",
                padding: "8px 16px",
                borderRadius: 8,
                border: "1px solid var(--color-border-subtle)",
                background: "transparent",
                color: "var(--color-text-tertiary)",
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
                transition: "background 150ms ease",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "var(--color-hover-bg)" }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent" }}
            >
              Restart {agent.name}
            </button>
          )}
        </div>
      </div>
    </>
  )
}

/* ─── Main Panel Component ─── */
export default function PantheonPanel({
  agents = DEFAULT_AGENTS,
  isProcessing = false,
  activeSessionId,
  liveAgents: liveData,
  queueStatus,
  sessionRoster,
  onAgentClick,
  onOpenDM: onOpenDMProp,
}: PantheonPanelProps) {
  // Merge live bridge data with visual config (icons, colors, descriptions)
  const liveAgents = React.useMemo(() => {
    return agents.map(a => {
      const live = liveData?.find(l => l.id === a.id)
      const merged = live ? {
        ...a,
        model: live.model || a.model,
        status: "idle" as AgentStatus, // bridge "running" = runtime alive, not actively processing
        memorySize: live.memorySize,
        skillCount: live.skillCount,
        lastActive: live.lastActive,
        currentTask: live.mode === "daemon"
          ? `restarts: ${live.restartCount ?? 0}${live.lastError ? ` · ${live.lastError}` : ""}`
          : a.currentTask,
      } : a
      // Real-time: if this agent's channel is currently processing, show running
      const agentSessionId = merged.id === "hermes" ? HOME_SESSION_ID : merged.id
      if (isProcessing && activeSessionId === agentSessionId) merged.status = "running"
      return merged
    })
  }, [agents, isProcessing, liveData])

  // Filter to roster if provided (non-empty = only show participating agents)
  const displayedAgents = React.useMemo(() => {
    if (!sessionRoster || sessionRoster.length === 0) return liveAgents
    return liveAgents.filter(a => sessionRoster.includes(a.id))
  }, [liveAgents, sessionRoster])

  // Agents not in roster (for "invite" section)
  const otherAgents = React.useMemo(() => {
    if (!sessionRoster || sessionRoster.length === 0) return []
    return liveAgents.filter(a => !sessionRoster.includes(a.id))
  }, [liveAgents, sessionRoster])

  return (
    <>
      <div className="panel-surface" style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minWidth: 220,
        background: "var(--color-surface)",
        borderLeft: "1px solid var(--color-border-dim)",
      }}>
        {/* Header */}
        <header
          className="flex flex-col flex-shrink-0"
          style={{
            paddingTop: "env(safe-area-inset-top)",
            borderBottom: "1px solid var(--color-border-dim)",
            // @ts-expect-error WebkitAppRegion is non-standard
            WebkitAppRegion: "drag",
          }}
        >
          <div style={{ height: 2 }} />
          <div className="flex items-center" style={{ height: 52, padding: "0 16px" }}>
            <span style={{
              fontSize: 10,
              fontWeight: 600,
              textTransform: "uppercase" as const,
              letterSpacing: "0.08em",
              color: "var(--color-text-ghost)",
            }}>
              Agents
            </span>
          </div>
        </header>

        {/* Agent List */}
        <div style={{ flex: 1, overflow: "auto", padding: "6px 6px" }}>
          {displayedAgents.map(agent => {
            const meta = STATUS_META[agent.status]
            const isActive = agent.status === "running"
            return (
              <button
                key={agent.id}
                onClick={() => {
                  onAgentClick?.(agent)
                }}
                className="session-row"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  padding: "9px 10px",
                  borderRadius: 8,
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left" as const,
                  position: "relative",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "var(--color-hover-bg)" }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent" }}
              >
                {/* Icon with subtle color bg */}
                <AgentIcon agent={agent} size={8} />

                {/* Name + model */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: isActive ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                    lineHeight: 1.3,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap" as const,
                  }}>
                    {agent.name}
                  </div>
                  <div style={{
                    fontSize: 10,
                    color: "var(--color-text-faint)",
                    lineHeight: 1.3,
                    fontFamily: "var(--font-geist-mono), monospace",
                  }}>
                    {agent.role.toLowerCase()}
                  </div>
                </div>

                {/* Queue badge + Status dot */}
                {(() => {
                  const qs = queueStatus?.[agent.id]
                  const depth = qs?.depth ?? 0
                  return depth > 0 ? (
                    <span style={{
                      fontSize: 9,
                      fontWeight: 600,
                      color: agent.color,
                      background: `${agent.color}20`,
                      borderRadius: 6,
                      padding: "1px 5px",
                      flexShrink: 0,
                      minWidth: 16,
                      textAlign: "center",
                    }}>
                      {depth}
                    </span>
                  ) : (
                    <span
                      className={meta.className}
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: "50%",
                        background: meta.color,
                        flexShrink: 0,
                      }}
                    />
                  )
                })()}
              </button>
            )
          })}

          {/* Other agents (not in roster) — collapsed section */}
          {otherAgents.length > 0 && (
            <>
              <div style={{
                fontSize: 9,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--color-text-quaternary)",
                padding: "12px 10px 4px",
              }}>
                Other agents
              </div>
              {otherAgents.map(agent => (
                <button
                  key={agent.id}
                  onClick={() => onAgentClick?.(agent)}
                  className="session-row"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    width: "100%",
                    padding: "5px 10px",
                    borderRadius: 8,
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                    opacity: 0.5,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.opacity = "0.8"; e.currentTarget.style.background = "var(--color-hover-bg)" }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = "0.5"; e.currentTarget.style.background = "transparent" }}
                >
                  <AgentIcon agent={agent} size={6} />
                  <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>{agent.name}</span>
                </button>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Agent Popout — rendered as portal-style overlay */}
    </>
  )
}
