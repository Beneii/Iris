"use client"

import * as React from "react"
import { Plus, Settings, Hash, X } from "lucide-react"
import { IrisLogo } from "@/components/iris-logo"
import { HOME_SESSION_ID, type SessionInfo, type ConnectionState } from "@/hooks/use-hermes-bridge"
import { DEFAULT_AGENTS, AgentIcon, type PantheonAgent } from "@/components/panels/pantheon-panel"
import { hapticLight, hapticMedium } from "@/lib/haptics"

/* ─── Props ─── */
export type ChannelInfo = {
  id: string
  name: string
  status: string
  project_id?: string
  created_at?: number
  agent_ids?: string[]
}

interface SessionSidebarProps {
  sessionsList: SessionInfo[]
  activeSessionId: string
  resumeSession: (id: string) => void
  deleteSession: (id: string) => void
  newSession: () => void
  connectionState: ConnectionState
  model: string
  onSettingsOpen: () => void
  isMobile: boolean
  sidebarOpen: boolean
  onSidebarClose: () => void
  unreadSessions?: Set<string>
  isProcessing?: boolean
  channels?: ChannelInfo[]
  onArchiveChannel?: (channelId: string) => void
}

/* ─── Helpers ─── */
function relativeTime(ts: number): string {
  if (!ts) return ""
  const now = Date.now() / 1000
  const diff = now - ts
  if (diff < 60) return "just now"
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 172800) return "Yesterday"
  return `${Math.floor(diff / 86400)}d ago`
}

/* ─── Shared row style ─── */
const rowStyle = (isActive: boolean): React.CSSProperties => ({
  width: "100%",
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "7px 10px",
  borderRadius: 8,
  background: isActive ? "var(--color-active-bg)" : "transparent",
  border: "none",
  cursor: isActive ? "default" : "pointer",
  textAlign: "left" as const,
  marginBottom: 1,
})

/* ─── Section header ─── */
function SectionHeader({ children, first }: { children: React.ReactNode; first?: boolean }) {
  return (
    <div style={{
      fontSize: 10,
      fontWeight: 600,
      textTransform: "uppercase" as const,
      letterSpacing: "0.05em",
      color: "var(--color-text-muted)",
      padding: first ? "4px 10px 6px" : "14px 10px 6px",
    }}>
      {children}
    </div>
  )
}

/* ─── Component ─── */
export default function SessionSidebar({
  sessionsList,
  activeSessionId,
  resumeSession,
  deleteSession,
  newSession,
  connectionState,
  model,
  onSettingsOpen,
  isMobile,
  sidebarOpen,
  onSidebarClose,
  unreadSessions,
  isProcessing,
  channels,
  onArchiveChannel,
}: SessionSidebarProps) {

  const activeChannels = React.useMemo(() =>
    (channels || []).filter(c => c.status === "active"),
    [channels]
  )
  const archivedChannels = React.useMemo(() =>
    (channels || []).filter(c => c.status === "archived"),
    [channels]
  )
  const [showArchived, setShowArchived] = React.useState(false)

  const navigate = (id: string) => {
    hapticLight()
    resumeSession(id)
    if (isMobile) onSidebarClose()
  }

  return (
    <>
      {/* Mobile backdrop */}
      {isMobile && (
        <div
          onClick={onSidebarClose}
          style={{
            position: "fixed",
            inset: 0,
            background: "var(--color-overlay-backdrop)",
            zIndex: 40,
            opacity: sidebarOpen ? 1 : 0,
            pointerEvents: sidebarOpen ? "auto" : "none",
            transition: "opacity 300ms cubic-bezier(0.32, 0.72, 0, 1)",
          }}
        />
      )}

      {/* Sidebar */}
      <aside
        className="flex flex-col flex-shrink-0 panel-surface"
        style={{
          width: 240,
          height: "100%",
          background: "var(--color-surface)",
          borderRight: "1px solid var(--color-border-dim)",
          ...(isMobile
            ? {
                position: "fixed" as const,
                top: 0,
                left: 0,
                bottom: 0,
                zIndex: 50,
                transform: sidebarOpen ? "translateX(0)" : "translateX(-100%)",
                transition: "transform 300ms cubic-bezier(0.32, 0.72, 0, 1)",
                paddingBottom: "env(safe-area-inset-bottom)",
              }
            : {}),
        }}
      >
        {/* ─── Brand Header ─── */}
        <div
          className="flex items-center justify-between px-5 pb-4"
          style={{ paddingTop: "max(env(safe-area-inset-top), 44px)", ...({ WebkitAppRegion: "drag" } as React.CSSProperties) }}
        >
          <div className="flex items-center justify-center" style={{ flex: 1 }}>
            <IrisLogo size={80} status={connectionState !== "connected" ? "error" : isProcessing ? "processing" : "idle"} />
          </div>
          <button
            onClick={() => { hapticLight(); newSession() }}
            className="new-session-btn"
            style={{
              background: "transparent",
              border: "1px solid var(--color-button-bg)",
              borderRadius: 6,
              cursor: "pointer",
              padding: 5,
              color: "var(--color-text-tertiary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              ...({ WebkitAppRegion: "no-drag" } as React.CSSProperties),
            }}
            title="New session"
          >
            <Plus size={14} strokeWidth={1.8} />
          </button>
        </div>

        {/* ─── Scrollable list ─── */}
        <div className="flex-1 overflow-y-auto px-2">

          {/* ═══ Direct Messages ═══ */}
          <SectionHeader first>Direct Messages</SectionHeader>

          {DEFAULT_AGENTS.map(agent => {
            const sessionId = agent.id === "hermes" ? HOME_SESSION_ID : agent.id
            const isActive = activeSessionId === sessionId
            const isUnread = !isActive && unreadSessions?.has(sessionId)
            const isAgentProcessing = isProcessing && activeSessionId === sessionId

            return (
              <button
                key={agent.id}
                onClick={() => !isActive && navigate(sessionId)}
                className="session-row"
                style={rowStyle(isActive)}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "var(--color-hover-bg)" }}
                onMouseLeave={(e) => { e.currentTarget.style.background = isActive ? "var(--color-active-bg)" : "transparent" }}
              >
                {/* Agent SVG icon */}
                <AgentIcon agent={agent} size={8} />

                {/* Name */}
                <span style={{
                  fontSize: 13,
                  fontWeight: isUnread ? 600 : isActive ? 500 : 400,
                  color: isActive ? "var(--color-text-primary)" : isUnread ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
                  flex: 1,
                }}>
                  {agent.name}
                </span>

                {/* Status indicators */}
                {isUnread ? (
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--color-iris-blue)", flexShrink: 0 }} />
                ) : isAgentProcessing ? (
                  <span className="dot-running" style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--color-status-success)", flexShrink: 0 }} />
                ) : null}
              </button>
            )
          })}

          {/* ═══ Channels ═══ */}
          <SectionHeader>Channels</SectionHeader>

          {activeChannels.map(ch => {
            const isActive = activeSessionId === ch.id
            const isUnread = !isActive && unreadSessions?.has(ch.id)
            return (
              <button
                key={ch.id}
                onClick={() => !isActive && navigate(ch.id)}
                className="session-row"
                style={rowStyle(isActive)}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "var(--color-hover-bg)" }}
                onMouseLeave={(e) => { e.currentTarget.style.background = isActive ? "var(--color-active-bg)" : "transparent" }}
              >
                <Hash size={14} strokeWidth={1.8} style={{ color: "var(--color-text-muted)", flexShrink: 0 }} />
                <span style={{
                  fontSize: 13,
                  fontWeight: isUnread ? 600 : isActive ? 500 : 400,
                  color: isActive ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {ch.name}
                </span>
                {isUnread && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--color-iris-blue)", flexShrink: 0 }} />}
                {ch.id !== "general" && onArchiveChannel && (
                  <span
                    className="channel-archive-btn"
                    onClick={(e) => { e.stopPropagation(); onArchiveChannel(ch.id) }}
                    style={{ cursor: "pointer", color: "var(--color-text-quaternary)", flexShrink: 0, padding: 2, opacity: 0, transition: "opacity 120ms" }}
                  >
                    <X size={12} />
                  </span>
                )}
              </button>
            )
          })}

          {/* Fallback: show general if no channels loaded yet */}
          {activeChannels.length === 0 && (() => {
            const isActive = activeSessionId === "general"
            return (
              <button onClick={() => navigate("general")} className="session-row" style={rowStyle(isActive)}>
                <Hash size={14} strokeWidth={1.8} style={{ color: "var(--color-text-muted)", flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: isActive ? "var(--color-text-primary)" : "var(--color-text-tertiary)", flex: 1 }}>general</span>
              </button>
            )
          })()}

          {/* ═══ Archived ═══ */}
          {archivedChannels.length > 0 && (
            <>
              <button
                onClick={() => setShowArchived(!showArchived)}
                style={{
                  background: "transparent", border: "none", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 4,
                  padding: "8px 16px 4px", width: "100%",
                }}
              >
                <span style={{
                  fontSize: 10, fontWeight: 600, textTransform: "uppercase",
                  letterSpacing: "0.05em", color: "var(--color-text-quaternary)",
                }}>
                  Archived ({archivedChannels.length})
                </span>
                <span style={{
                  fontSize: 8, color: "var(--color-text-quaternary)",
                  transform: showArchived ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 150ms ease",
                }}>
                  ▼
                </span>
              </button>
              {showArchived && archivedChannels.map(ch => {
                const isActive = activeSessionId === ch.id
                return (
                  <button
                    key={ch.id}
                    onClick={() => navigate(ch.id)}
                    className="session-row"
                    style={{ ...rowStyle(isActive), opacity: 0.5 }}
                    onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.8" }}
                    onMouseLeave={(e) => { e.currentTarget.style.opacity = isActive ? "1" : "0.5" }}
                  >
                    <Hash size={14} strokeWidth={1.8} style={{ color: "var(--color-text-quaternary)", flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: "var(--color-text-quaternary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {ch.name}
                    </span>
                  </button>
                )
              })}
            </>
          )}
        </div>

        {/* ─── Footer ─── */}
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ borderTop: "1px solid var(--color-border-dim)" }}
        >
          <div className="flex items-center gap-2">
            <span
              className="status-dot"
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background:
                  connectionState === "connected"
                    ? "var(--color-status-success)"
                    : connectionState === "connecting"
                      ? "var(--color-status-warning)"
                      : "var(--color-status-error)",
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
              {model || "\u2014"}
            </span>
          </div>
          <button
            aria-label="Open settings"
            onClick={onSettingsOpen}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: 10,
              margin: -10,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--color-text-muted)",
              transition: "color 150ms ease",
              minWidth: 44,
              minHeight: 44,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--color-text-secondary)" }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--color-text-muted)" }}
          >
            <Settings size={16} strokeWidth={1.5} />
          </button>
        </div>
      </aside>
    </>
  )
}
