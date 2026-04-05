"use client"

import * as React from "react"
import { Plus, Archive, Trash2, Link, Unlink } from "lucide-react"
import type { Project } from "@/types/hermes"
import { AGENT_COLORS } from "@/lib/markdown-components"

interface ProjectsPanelProps {
  projects: Project[]
  activeSessionId: string
  onCreateProject: (data: { name: string; description?: string; agents?: string[] }) => void
  onUpdateProject: (projectId: string, data: Record<string, unknown>) => void
  onDeleteProject: (projectId: string) => void
  onLinkSession: (projectId: string, sessionId: string) => void
  onUnlinkSession: (projectId: string, sessionId: string) => void
}

export function ProjectsPanel({
  projects,
  activeSessionId,
  onCreateProject,
  onUpdateProject,
  onDeleteProject,
  onLinkSession,
  onUnlinkSession,
}: ProjectsPanelProps) {
  const [showCreate, setShowCreate] = React.useState(false)
  const [selectedId, setSelectedId] = React.useState<string | null>(null)

  const active = projects.filter(p => p.status === "active")
  const archived = projects.filter(p => p.status === "archived")
  const selected = projects.find(p => p.id === selectedId)

  // Check if current session is linked to any project
  const linkedProject = projects.find(p => p.session_ids?.includes(activeSessionId))

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* Current session project link */}
      {linkedProject && (
        <div style={{
          padding: "6px 8px", borderRadius: 6,
          background: "var(--color-active-bg)",
          border: "1px solid var(--color-border-dim)",
          display: "flex", alignItems: "center", gap: 6,
        }}>
          <Link size={10} style={{ color: "var(--color-text-tertiary)", flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: "var(--color-text-secondary)", flex: 1 }}>
            Session linked to <strong>{linkedProject.name}</strong>
          </span>
          <button onClick={() => onUnlinkSession(linkedProject.id, activeSessionId)} style={iconBtn} title="Unlink">
            <Unlink size={10} />
          </button>
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={sectionHeader}>Active Projects ({active.length})</span>
        <button onClick={() => setShowCreate(true)} style={iconBtn}><Plus size={12} /></button>
      </div>

      {/* Active projects */}
      {active.map(p => (
        <ProjectRow
          key={p.id}
          project={p}
          isSelected={p.id === selectedId}
          onSelect={() => setSelectedId(p.id === selectedId ? null : p.id)}
          onArchive={() => onUpdateProject(p.id, { status: "archived" })}
          onDelete={() => onDeleteProject(p.id)}
          onLinkCurrentSession={() => onLinkSession(p.id, activeSessionId)}
          isCurrentSessionLinked={p.session_ids?.includes(activeSessionId)}
        />
      ))}

      {active.length === 0 && !showCreate && (
        <span style={{ fontSize: 11, color: "var(--color-text-quaternary)", padding: "4px 0" }}>No active projects</span>
      )}

      {/* Create form */}
      {showCreate && (
        <CreateForm
          onSubmit={(data) => { onCreateProject(data); setShowCreate(false) }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {/* Selected project detail */}
      {selected && (
        <div style={{ borderTop: "1px solid var(--color-border-dim)", paddingTop: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: 4 }}>
            {selected.name}
          </div>
          <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 6 }}>
            {selected.description || "No description"}
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>
            {selected.agent_ids?.map(aid => (
              <span key={aid} style={{
                fontSize: 10, fontWeight: 600,
                color: AGENT_COLORS[aid] || "var(--color-text-tertiary)",
                background: `${AGENT_COLORS[aid] || "#fff"}15`,
                borderRadius: 4, padding: "1px 6px",
              }}>
                {aid}
              </span>
            ))}
          </div>
          <div style={{ fontSize: 10, color: "var(--color-text-quaternary)" }}>
            {selected.session_ids?.length || 0} linked session{(selected.session_ids?.length || 0) !== 1 ? "s" : ""}
          </div>
        </div>
      )}

      {/* Archived */}
      {archived.length > 0 && (
        <>
          <span style={{ ...sectionHeader, paddingTop: 8 }}>Archived ({archived.length})</span>
          {archived.map(p => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0", opacity: 0.5 }}>
              <Archive size={10} style={{ color: "var(--color-text-quaternary)", flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", flex: 1 }}>{p.name}</span>
              <button onClick={() => onUpdateProject(p.id, { status: "active" })} style={iconBtn} title="Reactivate">
                <Plus size={10} />
              </button>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

function ProjectRow({ project, isSelected, onSelect, onArchive, onDelete, onLinkCurrentSession, isCurrentSessionLinked }: {
  project: Project
  isSelected: boolean
  onSelect: () => void
  onArchive: () => void
  onDelete: () => void
  onLinkCurrentSession: () => void
  isCurrentSessionLinked: boolean
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6, padding: "5px 4px",
      borderRadius: 6, background: isSelected ? "var(--color-active-bg)" : "transparent",
      cursor: "pointer",
    }} onClick={onSelect}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {project.name}
        </div>
        <div style={{ fontSize: 9, color: "var(--color-text-quaternary)" }}>
          {project.agent_ids?.length || 0} agents · {project.session_ids?.length || 0} sessions
        </div>
      </div>
      <div style={{ display: "flex", gap: 2, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
        {!isCurrentSessionLinked && (
          <button onClick={onLinkCurrentSession} style={iconBtn} title="Link current session"><Link size={10} /></button>
        )}
        <button onClick={onArchive} style={iconBtn} title="Archive"><Archive size={10} /></button>
        <button onClick={onDelete} style={{ ...iconBtn, color: "var(--color-status-error)" }} title="Delete"><Trash2 size={10} /></button>
      </div>
    </div>
  )
}

function CreateForm({ onSubmit, onCancel }: {
  onSubmit: (data: { name: string; description?: string; agents?: string[] }) => void
  onCancel: () => void
}) {
  const [name, setName] = React.useState("")
  const [desc, setDesc] = React.useState("")

  return (
    <div style={{ padding: 8, background: "var(--color-hover-bg)", borderRadius: 8, display: "flex", flexDirection: "column", gap: 6 }}>
      <input placeholder="Project name" value={name} onChange={e => setName(e.target.value)} style={inputStyle} autoFocus />
      <textarea placeholder="Description..." value={desc} onChange={e => setDesc(e.target.value)} rows={2} style={{ ...inputStyle, resize: "vertical" }} />
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <button onClick={onCancel} style={{ ...iconBtn, padding: "4px 10px", fontSize: 11 }}>Cancel</button>
        <button
          onClick={() => { if (name) onSubmit({ name, description: desc || undefined }) }}
          style={{ ...iconBtn, padding: "4px 10px", fontSize: 11, background: "var(--color-active-bg)", color: "var(--color-text-primary)" }}
        >
          Create
        </button>
      </div>
    </div>
  )
}

const sectionHeader: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, textTransform: "uppercase",
  letterSpacing: "0.05em", color: "var(--color-text-muted)",
}

const iconBtn: React.CSSProperties = {
  background: "transparent", border: "none", cursor: "pointer",
  color: "var(--color-text-tertiary)", padding: 2, borderRadius: 3,
  display: "flex", alignItems: "center",
}

const inputStyle: React.CSSProperties = {
  fontSize: 12, color: "var(--color-text-secondary)",
  fontFamily: "var(--font-geist-mono), monospace",
  background: "var(--color-button-bg)", border: "1px solid var(--color-border-subtle)",
  borderRadius: 4, padding: "4px 6px", outline: "none", width: "100%",
}
