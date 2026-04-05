"use client"

import * as React from "react"
import {
  Terminal,
  Brain,
  GitFork,
  Globe,
  Gauge,
  Shield,
  Zap,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  ChevronDown,
  FileText,
  Search,
  Wrench,
  Circle,
} from "lucide-react"
import { IrisLogo } from "@/components/iris-logo"
import type { ActivityEntry as ActivityEntryType, ToolStatus, CronJob, ConnectionState } from "@/hooks/use-hermes-bridge"

/* ─── Props ─── */
interface ActivityPanelProps {
  activities: ActivityEntryType[]
  isProcessing: boolean
  contextPressure: number
  agentName: string
  connectionState: ConnectionState
  jobsList: CronJob[]
}

/* ─── Tool icon helper ─── */
function getToolIcon(name: string) {
  const n = name.toLowerCase()
  if (n.includes("file") || n.includes("read") || n.includes("write") || n.includes("edit")) return FileText
  if (n.includes("search") || n.includes("grep") || n.includes("find")) return Search
  if (n.includes("terminal") || n.includes("bash") || n.includes("exec") || n.includes("shell")) return Terminal
  if (n.includes("memory")) return Brain
  if (n.includes("mcp") || n.includes("browser")) return Globe
  if (n.includes("agent") || n.includes("delegate")) return GitFork
  if (n.includes("approval")) return Shield
  return Wrench
}

/* ─── Status section ─── */
function StatusSection({ isProcessing, connectionState, agentName, contextPressure }: {
  isProcessing: boolean
  connectionState: ConnectionState
  agentName: string
  contextPressure: number
}) {
  const status = connectionState !== "connected"
    ? "offline"
    : isProcessing
      ? "working"
      : "idle"

  const statusLabel = { offline: "Offline", working: "Working", idle: "Ready" }[status]
  const statusColor = { offline: "var(--color-status-error)", working: "var(--color-text-secondary)", idle: "var(--color-status-success)" }[status]

  return (
    <div style={{ padding: "12px 8px", borderBottom: "1px solid var(--color-button-bg)" }}>
      {/* Agent status */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div style={{ position: "relative" }}>
          <IrisLogo size={20} />
          {status === "working" && (
            <div style={{
              position: "absolute", inset: -3, borderRadius: "50%",
              border: "1.5px solid var(--color-text-muted)",
              animation: "preparing-spin 2s linear infinite",
            }} />
          )}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-secondary)" }}>{agentName}</div>
          <div style={{ fontSize: 10, color: statusColor, display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 4, height: 4, borderRadius: "50%", background: statusColor, flexShrink: 0 }} />
            {statusLabel}
          </div>
        </div>
      </div>

      {/* Context pressure */}
      {contextPressure > 0 && (
        <div style={{ marginTop: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
            <span style={{ fontSize: 9, color: "var(--color-text-muted)", letterSpacing: "0.05em", textTransform: "uppercase" as const }}>Context</span>
            <span style={{ fontSize: 9, color: "var(--color-text-faint)", fontFamily: "var(--font-geist-mono), monospace" }}>{contextPressure}%</span>
          </div>
          <div style={{ width: "100%", height: 2, borderRadius: 1, background: "var(--color-button-bg)", overflow: "hidden" }}>
            <div className="pressure-bar-fill" style={{
              width: `${contextPressure}%`, height: "100%", borderRadius: 1,
              background: contextPressure > 80 ? "var(--color-status-error)" : "var(--color-text-muted)",
            }} />
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Task item (live step tracker) ─── */
function TaskItem({ entry }: { entry: ActivityEntryType }) {
  const isActive = entry.status === "running" || entry.status === "preparing"
  const isError = entry.status === "error"
  const Icon = getToolIcon(entry.title)

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "5px 8px", borderRadius: 6,
    }}>
      {/* Status indicator */}
      <div style={{ width: 16, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {isActive ? (
          <Loader2 size={12} strokeWidth={2} style={{ color: "var(--color-text-tertiary)", animation: "preparing-spin 1.5s linear infinite" }} />
        ) : isError ? (
          <XCircle size={12} strokeWidth={2} style={{ color: "var(--color-status-error)" }} />
        ) : entry.status === "success" ? (
          <CheckCircle2 size={12} strokeWidth={2} style={{ color: "var(--color-text-faint)" }} />
        ) : (
          <Circle size={12} strokeWidth={2} style={{ color: "var(--color-border-subtle)" }} />
        )}
      </div>

      {/* Icon + name */}
      <Icon size={11} strokeWidth={1.5} style={{ color: "var(--color-text-faint)", flexShrink: 0 }} />
      <span style={{
        fontSize: 11, fontWeight: isActive ? 500 : 400,
        color: isActive ? "var(--color-text-secondary)" : "var(--color-text-ghost)",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
        flex: 1,
      }}>
        {entry.title}
      </span>

      {/* Timestamp */}
      <span style={{ fontSize: 9, color: "var(--color-border-subtle)", fontFamily: "var(--font-geist-mono), monospace", flexShrink: 0 }}>
        {entry.timestamp}
      </span>
    </div>
  )
}

/* ─── Sub-agent card ─── */
function SubAgentCard({ entry }: { entry: ActivityEntryType }) {
  const isActive = entry.status === "running" || entry.status === "preparing"

  return (
    <div style={{
      padding: "8px 10px", borderRadius: 8,
      background: "var(--color-hover-bg)",
      border: `1px solid ${isActive ? "var(--color-border-dim)" : "var(--color-hover-bg)"}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <GitFork size={11} strokeWidth={1.5} style={{ color: "var(--color-text-tertiary)" }} />
        <span style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary)" }}>
          Sub-agent
        </span>
        {isActive && (
          <Loader2 size={10} strokeWidth={2} style={{ color: "var(--color-text-tertiary)", animation: "preparing-spin 1.5s linear infinite", marginLeft: "auto" }} />
        )}
        {entry.status === "success" && (
          <CheckCircle2 size={10} strokeWidth={2} style={{ color: "var(--color-text-faint)", marginLeft: "auto" }} />
        )}
      </div>
      {entry.summary && (
        <span style={{ fontSize: 10, color: "var(--color-text-muted)", lineHeight: 1.4 }}>
          {entry.summary}
        </span>
      )}
    </div>
  )
}

/* ─── Scheduled jobs section ─── */
function ScheduledSection({ jobs }: { jobs: CronJob[] }) {
  const active = jobs.filter((j) => j.enabled && j.state !== "completed")
  if (active.length === 0) return null

  return (
    <div style={{ padding: "8px 8px" }}>
      <div style={{ fontSize: 9, fontWeight: 500, color: "var(--color-text-faint)", letterSpacing: "0.06em", textTransform: "uppercase" as const, marginBottom: 6, paddingLeft: 2 }}>
        Scheduled
      </div>
      {active.slice(0, 5).map((job) => (
        <div key={job.id} style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "4px 2px",
        }}>
          <Clock size={10} strokeWidth={1.5} style={{ color: "var(--color-text-quaternary)", flexShrink: 0 }} />
          <span style={{
            fontSize: 10, color: "var(--color-text-ghost)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, flex: 1,
          }}>
            {job.name || job.prompt.slice(0, 30)}
          </span>
          <span style={{ fontSize: 9, color: "var(--color-border-subtle)", fontFamily: "var(--font-geist-mono), monospace", flexShrink: 0 }}>
            {job.schedule_display}
          </span>
        </div>
      ))}
    </div>
  )
}

/* ─── Main Panel ─── */
export default function ActivityPanel({ activities, isProcessing, contextPressure, agentName, connectionState, jobsList }: ActivityPanelProps) {
  const subAgents = activities.filter((a) => a.kind === "subagent")
  const tasks = activities.filter((a) => a.kind !== "subagent" && a.kind !== "status")
  const activeTasks = tasks.filter((a) => a.status === "running" || a.status === "preparing")
  const recentTasks = tasks.filter((a) => a.status === "success" || a.status === "error").slice(0, 8)

  return (
    <aside
      className="flex flex-col flex-shrink-0"
      style={{
        width: 272,
        background: "var(--color-surface)",
        borderLeft: "1px solid var(--color-border-dim)",
      }}
    >
      {/* Header */}
      <div style={{ height: 2, flexShrink: 0 }} />
      <div
        className="flex items-center justify-between px-5 flex-shrink-0"
        style={{ height: 52 }}
      >
        <span style={{
          fontSize: 11, fontWeight: 500, letterSpacing: "0.08em",
          color: "var(--color-text-tertiary)", textTransform: "uppercase" as const,
        }}>
          Status
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto" style={{ borderTop: "1px solid var(--color-border-dim)" }}>
        {/* Agent status + context */}
        <StatusSection
          isProcessing={isProcessing}
          connectionState={connectionState}
          agentName={agentName}
          contextPressure={contextPressure}
        />

        {/* Active sub-agents */}
        {subAgents.filter((a) => a.status === "running" || a.status === "preparing").length > 0 && (
          <div style={{ padding: "8px 8px", borderBottom: "1px solid var(--color-button-bg)" }}>
            <div style={{ fontSize: 9, fontWeight: 500, color: "var(--color-text-faint)", letterSpacing: "0.06em", textTransform: "uppercase" as const, marginBottom: 6, paddingLeft: 2 }}>
              Sub-agents
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {subAgents.filter((a) => a.status === "running" || a.status === "preparing").map((a) => (
                <SubAgentCard key={a.id} entry={a} />
              ))}
            </div>
          </div>
        )}

        {/* Active tasks (live checklist) */}
        {activeTasks.length > 0 && (
          <div style={{ padding: "8px 4px", borderBottom: "1px solid var(--color-button-bg)" }}>
            <div style={{ fontSize: 9, fontWeight: 500, color: "var(--color-text-faint)", letterSpacing: "0.06em", textTransform: "uppercase" as const, marginBottom: 4, paddingLeft: 10 }}>
              Working on
            </div>
            {activeTasks.map((a) => (
              <TaskItem key={a.id} entry={a} />
            ))}
          </div>
        )}

        {/* Recent completions */}
        {recentTasks.length > 0 && (
          <div style={{ padding: "8px 4px", borderBottom: "1px solid var(--color-button-bg)" }}>
            <div style={{ fontSize: 9, fontWeight: 500, color: "var(--color-text-faint)", letterSpacing: "0.06em", textTransform: "uppercase" as const, marginBottom: 4, paddingLeft: 10 }}>
              Recent
            </div>
            {recentTasks.map((a) => (
              <TaskItem key={a.id} entry={a} />
            ))}
          </div>
        )}

        {/* Scheduled jobs */}
        <ScheduledSection jobs={jobsList} />

        {/* Empty state */}
        {activities.length === 0 && jobsList.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16" style={{ gap: 12 }}>
            <div style={{ opacity: 0.08 }}>
              <IrisLogo size={28} />
            </div>
            <span style={{ fontSize: 11, color: "var(--color-text-quaternary)" }}>
              Waiting for activity
            </span>
          </div>
        )}
      </div>
    </aside>
  )
}
