"use client"

import * as React from "react"
import { X } from "lucide-react"
import type { CronJob, JobOutput } from "@/hooks/use-hermes-bridge"

/* ─── Props ─── */
interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  activeTab: string
  onTabChange: (tab: string) => void
  // Settings tab
  configData: Record<string, unknown> | null
  requestConfig: () => void
  setConfig: (key: string, value: unknown) => void
  model: string
  provider: string
  agentName: string
  // Memory tab
  memoryData: { memory: string; user: string } | null
  requestMemory: () => void
  // Tools tab
  toolsetsData: { name: string; available: boolean; tools: string[]; requirements: string[] }[] | null
  requestToolsets: () => void
  // Skills tab
  skillsData: { name: string; category: string; description: string; enabled: boolean }[] | null
  requestSkills: () => void
  // Permissions tab
  permissionsData: Record<string, string> | null
  requestPermissions: () => void
  setPermission: (category: string, value: string) => void
  // Tasks tab
  jobsList: CronJob[]
  jobOutputs: Record<string, JobOutput[]>
  listJobs: () => void
  createJob: (data: { prompt: string; schedule: string; name?: string; repeat?: unknown; deliver?: string }) => void
  pauseJob: (id: string) => void
  resumeJob: (id: string) => void
  triggerJob: (id: string) => void
  removeJob: (id: string) => void
  getJobOutput: (id: string) => void
}

/* ─── Tabs ─── */
const TABS = ["settings", "memory", "tools", "permissions", "tasks"] as const

/* ─── Main Component ─── */
export default function SettingsModal({
  isOpen,
  onClose,
  activeTab,
  onTabChange,
  configData,
  requestConfig,
  setConfig,
  model,
  provider,
  agentName,
  memoryData,
  requestMemory,
  toolsetsData,
  requestToolsets,
  skillsData,
  requestSkills,
  permissionsData,
  requestPermissions,
  setPermission,
  jobsList,
  jobOutputs,
  listJobs,
  createJob,
  pauseJob,
  resumeJob,
  triggerJob,
  removeJob,
  getJobOutput,
}: SettingsModalProps) {
  const modalRef = React.useRef<HTMLDivElement>(null)

  // Prefetch ALL tab data when modal opens (prevents flash on tab switch)
  React.useEffect(() => {
    if (isOpen) {
      modalRef.current?.focus()
      requestConfig()
      requestMemory()
      requestToolsets()
      requestSkills()
      requestPermissions()
      listJobs()
    }
  }, [isOpen, requestConfig, requestMemory, requestToolsets, requestSkills, requestPermissions, listJobs])

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.6)",
          zIndex: 60,
        }}
      />

      {/* Modal */}
      <div
        ref={modalRef}
        role="dialog"
        aria-label="Settings"
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose()
        }}
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 520,
          maxWidth: "90vw",
          height: "70vh",
          maxHeight: "80vh",
          background: "#1A1A1F",
          borderRadius: 8,
          border: "1px solid rgba(255,255,255,0.06)",
          zIndex: 70,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          outline: "none",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header + Tabs */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid rgba(255,255,255,0.04)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
            {TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => onTabChange(tab)}
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color:
                    activeTab === tab
                      ? "rgba(255,255,255,0.85)"
                      : "rgba(255,255,255,0.4)",
                  background: "transparent",
                  border: "none",
                  borderBottom:
                    activeTab === tab
                      ? "2px solid rgba(255,255,255,0.7)"
                      : "2px solid transparent",
                  cursor: "pointer",
                  padding: "4px 12px 8px 12px",
                  transition: "color 150ms ease, border-color 150ms ease",
                }}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
          <button
            aria-label="Close settings"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: 6,
              color: "rgba(255,255,255,0.4)",
              borderRadius: 4,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "rgba(255,255,255,0.7)"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "rgba(255,255,255,0.4)"
            }}
          >
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: "auto", padding: "16px 20px" }}>
          {activeTab === "settings" && (
            <SettingsTab
              configData={configData}
              requestConfig={requestConfig}
              setConfig={setConfig}
              model={model}
              provider={provider}
              agentName={agentName}
            />
          )}
          {activeTab === "memory" && (
            <MemoryTab memoryData={memoryData} requestMemory={requestMemory} />
          )}
          {activeTab === "tools" && (
            <ToolsTab
              toolsetsData={toolsetsData}
              requestToolsets={requestToolsets}
            />
          )}
          {activeTab === "permissions" && (
            <PermissionsTab
              permissionsData={permissionsData}
              requestPermissions={requestPermissions}
              setPermission={setPermission}
            />
          )}
          {activeTab === "tasks" && (
            <TasksTab
              jobsList={jobsList}
              jobOutputs={jobOutputs}
              listJobs={listJobs}
              createJob={createJob}
              pauseJob={pauseJob}
              resumeJob={resumeJob}
              triggerJob={triggerJob}
              removeJob={removeJob}
              getJobOutput={getJobOutput}
            />
          )}
        </div>
      </div>
    </>
  )
}


/* ═══════════════════════════════════════════════
   Settings Tab
   ═══════════════════════════════════════════════ */

function SettingsTab({
  configData,
  requestConfig,
  setConfig,
  model,
  provider,
  agentName,
}: {
  configData: Record<string, unknown> | null
  requestConfig: () => void
  setConfig: (key: string, value: unknown) => void
  model: string
  provider: string
  agentName: string
}) {
  const hasRequested = React.useRef(false)
  const [editingKey, setEditingKey] = React.useState<string | null>(null)
  const [editValue, setEditValue] = React.useState("")

  React.useEffect(() => {
    if (!hasRequested.current) {
      hasRequested.current = true
      requestConfig()
    }
  }, [requestConfig])

  const handleStartEdit = (key: string, currentValue: string) => {
    setEditingKey(key)
    setEditValue(currentValue)
  }

  const handleSaveEdit = () => {
    if (editingKey) {
      setConfig(editingKey, editValue)
      setEditingKey(null)
    }
  }

  const getNestedValue = (obj: Record<string, unknown>, path: string): string => {
    const parts = path.split(".")
    let current: unknown = obj
    for (const part of parts) {
      if (current && typeof current === "object" && part in (current as Record<string, unknown>)) {
        current = (current as Record<string, unknown>)[part]
      } else {
        return ""
      }
    }
    return String(current ?? "")
  }

  const terminalBackend = configData ? getNestedValue(configData, "terminal.backend") : ""
  const approvalMode = configData ? getNestedValue(configData, "approvals.mode") : ""
  const maxTurns = configData ? getNestedValue(configData, "agent.max_turns") : ""

  const settingRowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 4px",
    borderBottom: "1px solid rgba(255,255,255,0.03)",
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    color: "rgba(255,255,255,0.3)",
  }

  const valueStyle: React.CSSProperties = {
    fontSize: 12,
    color: "rgba(255,255,255,0.5)",
    fontFamily: "var(--font-geist-mono), monospace",
    textAlign: "right" as const,
  }

  const editableValueStyle: React.CSSProperties = {
    ...valueStyle,
    cursor: "pointer",
    borderBottom: "1px dashed rgba(255,255,255,0.1)",
    paddingBottom: 1,
    display: "flex",
    alignItems: "center",
    gap: 4,
  }

  const inputStyle: React.CSSProperties = {
    fontSize: 12,
    color: "rgba(255,255,255,0.7)",
    fontFamily: "var(--font-geist-mono), monospace",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 4,
    padding: "2px 6px",
    outline: "none",
    textAlign: "right" as const,
    width: 120,
  }

  if (!configData) {
    return (
      <div className="flex flex-col items-center justify-center py-16" style={{ gap: 12 }}>
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.2)" }}>Loading config...</span>
      </div>
    )
  }

  const editableRow = (label: string, key: string, value: string) => (
    <div style={settingRowStyle}>
      <span style={labelStyle}>{label}</span>
      {editingKey === key ? (
        <input
          autoFocus
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSaveEdit()
            if (e.key === "Escape") setEditingKey(null)
          }}
          onBlur={() => setEditingKey(null)}
          style={inputStyle}
        />
      ) : (
        <span
          style={editableValueStyle}
          onClick={() => handleStartEdit(key, value)}
        >
          {value || "\u2014"}
          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.1)" }}>&#9998;</span>
        </span>
      )}
    </div>
  )

  return (
    <div>
      {/* Model (read-only) */}
      <div style={settingRowStyle}>
        <span style={labelStyle}>Model</span>
        <span style={{ ...valueStyle, display: "flex", alignItems: "center", gap: 4 }}>
          {model || "\u2014"}
          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.12)" }}>(read-only)</span>
        </span>
      </div>

      {/* Provider (read-only) */}
      <div style={settingRowStyle}>
        <span style={labelStyle}>Provider</span>
        <span style={{ ...valueStyle, display: "flex", alignItems: "center", gap: 4 }}>
          {provider || "\u2014"}
          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.12)" }}>(read-only)</span>
        </span>
      </div>

      {/* Agent (read-only) */}
      <div style={settingRowStyle}>
        <span style={labelStyle}>Agent</span>
        <span style={{ ...valueStyle, display: "flex", alignItems: "center", gap: 4 }}>
          {agentName || "\u2014"}
          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.12)" }}>(read-only)</span>
        </span>
      </div>

      {/* Editable rows */}
      {editableRow("Terminal", "terminal.backend", terminalBackend)}
      {editableRow("Approvals", "approvals.mode", approvalMode)}
      {editableRow("Max turns", "agent.max_turns", maxTurns)}
    </div>
  )
}


/* ═══════════════════════════════════════════════
   Memory Tab
   ═══════════════════════════════════════════════ */

function MemoryTab({
  memoryData,
  requestMemory,
}: {
  memoryData: { memory: string; user: string } | null
  requestMemory: () => void
}) {
  const hasRequested = React.useRef(false)
  React.useEffect(() => {
    if (!hasRequested.current) {
      hasRequested.current = true
      requestMemory()
    }
  }, [requestMemory])

  if (!memoryData) {
    return (
      <div className="flex flex-col items-center justify-center py-16" style={{ gap: 12 }}>
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.2)" }}>Loading memory...</span>
      </div>
    )
  }

  const sectionHeaderStyle: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 500,
    letterSpacing: "0.08em",
    color: "rgba(255,255,255,0.3)",
    textTransform: "uppercase" as const,
    display: "block",
    marginBottom: 8,
    paddingLeft: 4,
  }

  const sectionContentStyle: React.CSSProperties = {
    fontSize: 12,
    color: "rgba(255,255,255,0.3)",
    lineHeight: 1.6,
    whiteSpace: "pre-wrap" as const,
    padding: "8px",
    background: "rgba(255,255,255,0.02)",
    borderRadius: 6,
    maxHeight: 300,
    overflowY: "auto" as const,
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <span style={sectionHeaderStyle}>AGENT MEMORY</span>
        <div style={sectionContentStyle}>
          {memoryData.memory
            ? memoryData.memory.replace(/\u00A7/g, "").trim()
            : "No memory data"}
        </div>
      </div>
      <div>
        <span style={sectionHeaderStyle}>USER PROFILE</span>
        <div style={sectionContentStyle}>
          {memoryData.user
            ? memoryData.user.replace(/\u00A7/g, "").trim()
            : "No user profile"}
        </div>
      </div>
    </div>
  )
}


/* ═══════════════════════════════════════════════
   Tools Tab
   ═══════════════════════════════════════════════ */

function ToolsTab({
  toolsetsData,
  requestToolsets,
}: {
  toolsetsData: { name: string; available: boolean; tools: string[]; requirements: string[] }[] | null
  requestToolsets: () => void
}) {
  const hasRequested = React.useRef(false)
  React.useEffect(() => {
    if (!hasRequested.current) {
      hasRequested.current = true
      requestToolsets()
    }
  }, [requestToolsets])

  if (!toolsetsData) {
    return (
      <div style={{ padding: 16, fontSize: 12, color: "rgba(255,255,255,0.2)" }}>
        Loading toolsets...
      </div>
    )
  }

  const available = toolsetsData.filter((t) => t.available)
  const unavailable = toolsetsData.filter((t) => !t.available)

  const sectionLabel: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 500,
    color: "rgba(255,255,255,0.2)",
    letterSpacing: "0.06em",
    textTransform: "uppercase" as const,
    marginBottom: 8,
  }

  return (
    <div style={{ padding: "4px 8px" }}>
      <div style={sectionLabel}>Available ({available.length})</div>
      {available.map((ts) => (
        <div key={ts.name} style={{ marginBottom: 8 }}>
          <div className="flex items-center gap-2" style={{ marginBottom: 2 }}>
            <span
              className="status-dot dot-success"
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: "#34C759",
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.5)" }}>
              {ts.name}
            </span>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.15)" }}>
              {ts.tools.length}
            </span>
          </div>
          <div style={{ paddingLeft: 13, fontSize: 11, color: "rgba(255,255,255,0.15)" }}>
            {ts.tools.join(", ")}
          </div>
        </div>
      ))}

      {unavailable.length > 0 && (
        <>
          <div
            style={{
              ...sectionLabel,
              color: "rgba(255,255,255,0.15)",
              marginTop: 16,
            }}
          >
            Unavailable ({unavailable.length})
          </div>
          {unavailable.map((ts) => (
            <div key={ts.name} style={{ marginBottom: 6 }}>
              <div className="flex items-center gap-2">
                <span
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: "50%",
                    background: "rgba(255,255,255,0.08)",
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 12, fontWeight: 400, color: "rgba(255,255,255,0.2)" }}>
                  {ts.name}
                </span>
              </div>
              {ts.requirements.length > 0 && (
                <div style={{ paddingLeft: 13, fontSize: 10, color: "rgba(239,68,68,0.4)" }}>
                  Requires configuration
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  )
}


/* ═══════════════════════════════════════════════
   Skills Tab (NEW)
   ═══════════════════════════════════════════════ */

const skillCategoryColor: Record<string, string> = {
  apple: "#5BA4F6",
  "autonomous-ai-agents": "rgba(255,255,255,0.7)",
  creative: "#F65B8A",
  github: "rgba(255,255,255,0.6)",
  research: "#5BF6C8",
  productivity: "#F6D55B",
  media: "#F65B8A",
  "software-development": "#5BA4F6",
}

function getSkillColor(category: string): string {
  return skillCategoryColor[category] ?? "rgba(255,255,255,0.4)"
}

function SkillsTab({
  skillsData,
  requestSkills,
}: {
  skillsData: { name: string; category: string; description: string; enabled: boolean }[] | null
  requestSkills: () => void
}) {
  const hasRequested = React.useRef(false)
  const [search, setSearch] = React.useState("")

  React.useEffect(() => {
    if (!hasRequested.current) {
      hasRequested.current = true
      requestSkills()
    }
  }, [requestSkills])

  if (!skillsData) {
    return (
      <div style={{ padding: 16, fontSize: 12, color: "rgba(255,255,255,0.2)" }}>
        Loading skills...
      </div>
    )
  }

  // Filter
  const filtered = search.trim()
    ? skillsData.filter(
        (s) =>
          s.name.toLowerCase().includes(search.toLowerCase()) ||
          s.category.toLowerCase().includes(search.toLowerCase()) ||
          s.description.toLowerCase().includes(search.toLowerCase())
      )
    : skillsData

  // Group by category
  const grouped: Record<string, typeof filtered> = {}
  for (const skill of filtered) {
    const cat = skill.category || "other"
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat].push(skill)
  }

  const categories = Object.keys(grouped).sort()

  return (
    <div style={{ padding: "4px 0" }}>
      {/* Search input */}
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Filter skills..."
        style={{
          width: "100%",
          fontSize: 12,
          color: "rgba(255,255,255,0.7)",
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 6,
          padding: "8px 12px",
          outline: "none",
          fontFamily: "inherit",
          marginBottom: 16,
        }}
      />

      {filtered.length === 0 ? (
        <div style={{ padding: 24, textAlign: "center" as const }}>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.15)" }}>
            No skills found
          </span>
        </div>
      ) : (
        categories.map((category) => {
          const skills = grouped[category]
          const color = getSkillColor(category)

          return (
            <div key={category} style={{ marginBottom: 16 }}>
              {/* Category header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: color,
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 500,
                    color: "rgba(255,255,255,0.25)",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase" as const,
                  }}
                >
                  {category.replace(/-/g, " ")}
                </span>
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.1)" }}>
                  {skills.length}
                </span>
              </div>

              {/* Skill cards */}
              <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingLeft: 14 }}>
                {skills.map((skill) => (
                  <div
                    key={skill.name}
                    style={{
                      padding: "8px 10px",
                      background: "rgba(255,255,255,0.02)",
                      borderRadius: 6,
                      borderLeft: `2px solid ${color}`,
                      transition: "background 120ms ease",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: skill.description ? 2 : 0,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 500,
                          color: skill.enabled
                            ? "rgba(255,255,255,0.6)"
                            : "rgba(255,255,255,0.25)",
                        }}
                      >
                        {skill.name}
                      </span>
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 500,
                          color: skill.enabled ? "#34C759" : "rgba(255,255,255,0.15)",
                          textTransform: "uppercase" as const,
                          letterSpacing: "0.04em",
                        }}
                      >
                        {skill.enabled ? "ON" : "OFF"}
                      </span>
                    </div>
                    {skill.description && (
                      <p
                        style={{
                          fontSize: 11,
                          color: "rgba(255,255,255,0.2)",
                          margin: 0,
                          lineHeight: 1.4,
                        }}
                      >
                        {skill.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}


/* ═══════════════════════════════════════════════
   Permissions Tab
   ═══════════════════════════════════════════════ */

const PERMISSION_LABELS: Record<string, string> = {
  computer_use: "Computer Use",
  browser_control: "Browser Control",
  file_system: "File System",
  terminal: "Terminal",
  network: "Network",
  memory_write: "Memory Write",
  delegation: "Delegation",
}

const PERMISSION_OPTIONS = ["allowed", "ask", "denied"] as const

function PermissionsTab({
  permissionsData,
  requestPermissions,
  setPermission,
}: {
  permissionsData: Record<string, string> | null
  requestPermissions: () => void
  setPermission: (category: string, value: string) => void
}) {
  const hasRequested = React.useRef(false)
  React.useEffect(() => {
    if (!hasRequested.current) {
      hasRequested.current = true
      requestPermissions()
    }
  }, [requestPermissions])

  if (!permissionsData) {
    return (
      <div style={{ padding: 16, fontSize: 12, color: "rgba(255,255,255,0.2)" }}>
        Loading permissions...
      </div>
    )
  }

  const dotColor = (opt: string) => {
    if (opt === "allowed") return "#34C759"
    if (opt === "ask") return "#F59E0B"
    return "#EF4444"
  }

  return (
    <div style={{ padding: "4px 0", display: "flex", flexDirection: "column", gap: 2 }}>
      {Object.keys(PERMISSION_LABELS).map((category) => {
        const current = permissionsData[category] || "allowed"
        return (
          <div
            key={category}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 4px",
              borderBottom: "1px solid rgba(255,255,255,0.03)",
            }}
          >
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", fontWeight: 500 }}>
              {PERMISSION_LABELS[category]}
            </span>
            <div style={{ display: "flex", gap: 0, borderRadius: 6, overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)" }}>
              {PERMISSION_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  onClick={() => setPermission(category, opt)}
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    color: current === opt ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.25)",
                    background: current === opt ? "rgba(255,255,255,0.06)" : "transparent",
                    border: "none",
                    cursor: "pointer",
                    padding: "4px 10px",
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    transition: "all 120ms ease",
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: current === opt ? dotColor(opt) : "rgba(255,255,255,0.08)",
                      flexShrink: 0,
                    }}
                  />
                  {opt.charAt(0).toUpperCase() + opt.slice(1)}
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}


/* ═══════════════════════════════════════════════
   Tasks Tab
   ═══════════════════════════════════════════════ */

function TasksTab({
  jobsList,
  jobOutputs,
  listJobs,
  createJob,
  pauseJob,
  resumeJob,
  triggerJob,
  removeJob,
  getJobOutput,
}: {
  jobsList: CronJob[]
  jobOutputs: Record<string, JobOutput[]>
  listJobs: () => void
  createJob: (data: { prompt: string; schedule: string; name?: string; repeat?: unknown; deliver?: string }) => void
  pauseJob: (id: string) => void
  resumeJob: (id: string) => void
  triggerJob: (id: string) => void
  removeJob: (id: string) => void
  getJobOutput: (id: string) => void
}) {
  const hasRequested = React.useRef(false)
  const [expandedJob, setExpandedJob] = React.useState<string | null>(null)
  const [showNewForm, setShowNewForm] = React.useState(false)
  const [newPrompt, setNewPrompt] = React.useState("")
  const [newSchedule, setNewSchedule] = React.useState("")
  const [newName, setNewName] = React.useState("")

  React.useEffect(() => {
    if (!hasRequested.current) {
      hasRequested.current = true
      listJobs()
    }
  }, [listJobs])

  const handleCreate = () => {
    if (!newPrompt.trim() || !newSchedule.trim()) return
    createJob({
      prompt: newPrompt.trim(),
      schedule: newSchedule.trim(),
      name: newName.trim() || undefined,
    })
    setNewPrompt("")
    setNewSchedule("")
    setNewName("")
    setShowNewForm(false)
  }

  const handleExpand = (jobId: string) => {
    if (expandedJob === jobId) {
      setExpandedJob(null)
    } else {
      setExpandedJob(jobId)
      getJobOutput(jobId)
    }
  }

  const jobStateColor = (state: string, lastStatus: string | null) => {
    if (lastStatus === "error") return "#EF4444"
    switch (state) {
      case "scheduled":
      case "running":
        return "rgba(255,255,255,0.7)"
      case "paused":
        return "#F59E0B"
      case "completed":
        return "#34C759"
      default:
        return "rgba(255,255,255,0.2)"
    }
  }

  const formatTime = (ts: string | null) => {
    if (!ts) return "\u2014"
    try {
      const d = new Date(ts)
      return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    } catch {
      return ts
    }
  }

  const formInputStyle: React.CSSProperties = {
    fontSize: 12,
    color: "rgba(255,255,255,0.7)",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 4,
    padding: "6px 8px",
    outline: "none",
    fontFamily: "inherit",
  }

  return (
    <div style={{ padding: "4px 0" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 500,
            color: "rgba(255,255,255,0.2)",
            letterSpacing: "0.06em",
            textTransform: "uppercase" as const,
          }}
        >
          Scheduled Tasks ({jobsList.length})
        </span>
        <button
          onClick={() => setShowNewForm(!showNewForm)}
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: "rgba(255,255,255,0.7)",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: "2px 0",
          }}
        >
          {showNewForm ? "Cancel" : "+ New Task"}
        </button>
      </div>

      {/* New task form */}
      {showNewForm && (
        <div
          style={{
            padding: 12,
            background: "rgba(255,255,255,0.02)",
            borderRadius: 6,
            marginBottom: 12,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Name (optional)"
            style={formInputStyle}
          />
          <textarea
            value={newPrompt}
            onChange={(e) => setNewPrompt(e.target.value)}
            placeholder="Prompt \u2014 what should the agent do?"
            rows={3}
            style={{
              ...formInputStyle,
              resize: "vertical" as const,
              lineHeight: 1.5,
            }}
          />
          <div>
            <input
              value={newSchedule}
              onChange={(e) => setNewSchedule(e.target.value)}
              placeholder="Schedule: every 30m, 0 9 * * *, in 2h"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate()
              }}
              style={{
                ...formInputStyle,
                fontFamily: "var(--font-geist-mono), monospace",
                width: "100%",
              }}
            />
            <span
              style={{
                fontSize: 10,
                color: "rgba(255,255,255,0.12)",
                marginTop: 2,
                display: "block",
              }}
            >
              Examples: &quot;every 30m&quot;, &quot;0 9 * * *&quot;, &quot;in 2h&quot;
            </span>
          </div>
          <button
            onClick={handleCreate}
            disabled={!newPrompt.trim() || !newSchedule.trim()}
            style={{
              fontSize: 12,
              fontWeight: 500,
              color:
                newPrompt.trim() && newSchedule.trim()
                  ? "#fff"
                  : "rgba(255,255,255,0.2)",
              background:
                newPrompt.trim() && newSchedule.trim()
                  ? "rgba(255,255,255,0.7)"
                  : "rgba(255,255,255,0.04)",
              border: "none",
              borderRadius: 4,
              padding: "6px 12px",
              cursor:
                newPrompt.trim() && newSchedule.trim() ? "pointer" : "default",
              alignSelf: "flex-end",
            }}
          >
            Create
          </button>
        </div>
      )}

      {/* Job list */}
      {jobsList.length === 0 ? (
        <div style={{ padding: 24, textAlign: "center" as const }}>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.15)" }}>
            No scheduled tasks
          </span>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {jobsList.map((job) => {
            const isExpanded = expandedJob === job.id
            const dotColor = jobStateColor(job.state, job.last_status)
            const outputs = jobOutputs[job.id] || []

            return (
              <div key={job.id}>
                {/* Job row */}
                <button
                  onClick={() => handleExpand(job.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    width: "100%",
                    padding: "8px 4px",
                    background: isExpanded
                      ? "rgba(255,255,255,0.02)"
                      : "transparent",
                    border: "none",
                    borderRadius: 6,
                    cursor: "pointer",
                    textAlign: "left" as const,
                    transition: "background 120ms ease",
                  }}
                  onMouseEnter={(e) => {
                    if (!isExpanded) e.currentTarget.style.background = "rgba(255,255,255,0.02)"
                  }}
                  onMouseLeave={(e) => {
                    if (!isExpanded) e.currentTarget.style.background = "transparent"
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: dotColor,
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 500,
                        color: "rgba(255,255,255,0.6)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap" as const,
                      }}
                    >
                      {job.name || job.prompt.slice(0, 40)}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: "rgba(255,255,255,0.15)",
                        fontFamily: "var(--font-geist-mono), monospace",
                      }}
                    >
                      {job.schedule_display}
                    </div>
                  </div>
                  <div style={{ flexShrink: 0, textAlign: "right" as const }}>
                    {job.last_run_at && (
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.15)" }}>
                        {formatTime(job.last_run_at)}
                      </div>
                    )}
                    {job.last_status && (
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 500,
                          color: job.last_status === "ok" ? "#34C759" : "#EF4444",
                        }}
                      >
                        {job.last_status}
                      </span>
                    )}
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      color: "rgba(255,255,255,0.1)",
                      transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                      transition: "transform 200ms ease",
                      display: "inline-block",
                      flexShrink: 0,
                    }}
                  >
                    &#9662;
                  </span>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div
                    className="reasoning-content"
                    style={{
                      padding: "8px 4px 12px 18px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    {/* Prompt */}
                    <div>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 500,
                          color: "rgba(255,255,255,0.15)",
                          textTransform: "uppercase" as const,
                          letterSpacing: "0.05em",
                        }}
                      >
                        Prompt
                      </span>
                      <div
                        style={{
                          fontSize: 12,
                          color: "rgba(255,255,255,0.35)",
                          lineHeight: 1.5,
                          marginTop: 2,
                          maxHeight: 80,
                          overflow: "auto",
                        }}
                      >
                        {job.prompt}
                      </div>
                    </div>

                    {/* Info grid */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "4px 16px",
                      }}
                    >
                      <div>
                        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.12)" }}>
                          Status
                        </span>
                        <div
                          style={{
                            fontSize: 11,
                            color: "rgba(255,255,255,0.4)",
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                            marginTop: 1,
                          }}
                        >
                          <span
                            style={{
                              width: 5,
                              height: 5,
                              borderRadius: "50%",
                              background: dotColor,
                              display: "inline-block",
                            }}
                          />
                          {job.state}
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.12)" }}>
                          Schedule
                        </span>
                        <div
                          style={{
                            fontSize: 11,
                            color: "rgba(255,255,255,0.4)",
                            fontFamily: "var(--font-geist-mono), monospace",
                            marginTop: 1,
                          }}
                        >
                          {job.schedule_display}
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.12)" }}>
                          Next run
                        </span>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>
                          {formatTime(job.next_run_at)}
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.12)" }}>
                          Repeat
                        </span>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>
                          {job.repeat.times != null
                            ? `${job.repeat.completed}/${job.repeat.times} completed`
                            : "Recurring"}
                        </div>
                      </div>
                    </div>

                    {/* Last error */}
                    {job.last_error && (
                      <div
                        style={{
                          fontSize: 11,
                          color: "rgba(239,68,68,0.6)",
                          background: "rgba(239,68,68,0.04)",
                          borderRadius: 4,
                          padding: "4px 8px",
                          borderLeft: "2px solid rgba(239,68,68,0.2)",
                        }}
                      >
                        {job.last_error}
                      </div>
                    )}

                    {/* Controls */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        paddingTop: 4,
                      }}
                    >
                      <button
                        onClick={() => triggerJob(job.id)}
                        style={{
                          fontSize: 11,
                          fontWeight: 500,
                          color: "rgba(255,255,255,0.7)",
                          background: "transparent",
                          border: "none",
                          cursor: "pointer",
                          padding: 0,
                        }}
                      >
                        Trigger Now
                      </button>
                      {job.state === "paused" ? (
                        <button
                          onClick={() => resumeJob(job.id)}
                          style={{
                            fontSize: 11,
                            fontWeight: 500,
                            color: "#34C759",
                            background: "transparent",
                            border: "none",
                            cursor: "pointer",
                            padding: 0,
                          }}
                        >
                          Resume
                        </button>
                      ) : job.state !== "completed" ? (
                        <button
                          onClick={() => pauseJob(job.id)}
                          style={{
                            fontSize: 11,
                            fontWeight: 500,
                            color: "#F59E0B",
                            background: "transparent",
                            border: "none",
                            cursor: "pointer",
                            padding: 0,
                          }}
                        >
                          Pause
                        </button>
                      ) : null}
                      <button
                        onClick={() => {
                          removeJob(job.id)
                          setExpandedJob(null)
                        }}
                        style={{
                          fontSize: 11,
                          fontWeight: 500,
                          color: "rgba(239,68,68,0.5)",
                          background: "transparent",
                          border: "none",
                          cursor: "pointer",
                          padding: 0,
                        }}
                      >
                        Delete
                      </button>
                    </div>

                    {/* Output */}
                    {outputs.length > 0 && (
                      <div>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 500,
                            color: "rgba(255,255,255,0.15)",
                            textTransform: "uppercase" as const,
                            letterSpacing: "0.05em",
                          }}
                        >
                          Latest Output
                        </span>
                        <pre
                          style={{
                            fontSize: 11,
                            color: "rgba(255,255,255,0.3)",
                            fontFamily: "var(--font-geist-mono), monospace",
                            margin: "4px 0 0 0",
                            padding: "8px",
                            background: "rgba(255,255,255,0.02)",
                            borderRadius: 4,
                            borderLeft: "2px solid rgba(255,255,255,0.15)",
                            overflow: "auto",
                            whiteSpace: "pre-wrap" as const,
                            maxHeight: 200,
                            lineHeight: 1.5,
                          }}
                        >
                          {outputs[0].content}
                        </pre>
                        {outputs.length > 1 && (
                          <span
                            style={{
                              fontSize: 10,
                              color: "rgba(255,255,255,0.1)",
                              marginTop: 2,
                              display: "block",
                            }}
                          >
                            + {outputs.length - 1} earlier run
                            {outputs.length > 2 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
