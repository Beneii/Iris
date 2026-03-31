"use client"

import * as React from "react"
import { Plus, X, Settings, Hash } from "lucide-react"
import { IrisLogo } from "@/components/iris-logo"
import { HOME_SESSION_ID, type SessionInfo, type ConnectionState } from "@/hooks/use-hermes-bridge"
import { hapticLight, hapticMedium } from "@/lib/haptics"

/* ─── Props ─── */
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
}: SessionSidebarProps) {
  return (
    <>
      {/* Mobile backdrop */}
      {isMobile && (
        <div
          onClick={onSidebarClose}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: 40,
            opacity: sidebarOpen ? 1 : 0,
            pointerEvents: sidebarOpen ? "auto" : "none",
            transition: "opacity 300ms cubic-bezier(0.32, 0.72, 0, 1)",
          }}
        />
      )}

      {/* Sidebar */}
      <aside
        className="flex flex-col flex-shrink-0"
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
              border: "1px solid rgba(255,255,255,0.04)",
              borderRadius: 6,
              cursor: "pointer",
              padding: 5,
              color: "rgba(255,255,255,0.3)",
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

        {/* ─── Session List ─── */}
        <div className="flex-1 overflow-y-auto px-2">
          {/* ─── Channels ─── */}
          <div style={{
            fontSize: 10,
            fontWeight: 600,
            textTransform: "uppercase" as const,
            letterSpacing: "0.05em",
            color: "rgba(255,255,255,0.2)",
            padding: "4px 12px 4px",
            marginBottom: 2,
          }}>
            Channels
          </div>
          {(() => {
            const homeSession = sessionsList.find((s) => s.id === HOME_SESSION_ID)
            if (!homeSession) return null
            const isActive = homeSession.id === activeSessionId
            const isUnread = !isActive && unreadSessions?.has(homeSession.id)
            return (
              <button
                key="home"
                onClick={() => {
                  if (!isActive) {
                    hapticLight()
                    resumeSession(homeSession.id)
                    if (isMobile) onSidebarClose()
                  }
                }}
                className={`session-row flex items-center gap-2 ${isActive ? "active-session" : ""}`}
                style={{
                  width: "100%",
                  padding: "6px 12px",
                  borderRadius: 8,
                  background: isActive ? "var(--color-active-bg)" : "transparent",
                  border: "none",
                  cursor: isActive ? "default" : "pointer",
                  textAlign: "left" as const,
                  marginBottom: 2,
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.03)"
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.background = "transparent"
                }}
              >
                <Hash size={14} strokeWidth={1.8} style={{
                  color: isActive ? "rgba(255,255,255,0.5)" : isUnread ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.2)",
                  flexShrink: 0,
                }} />
                <span style={{
                  fontSize: 13,
                  fontWeight: isUnread ? 600 : 500,
                  color: isActive ? "rgba(255,255,255,0.85)" : isUnread ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.5)",
                }}>
                  general
                </span>
                {isUnread && (
                  <span style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: "#5BA4F6", flexShrink: 0,
                    marginLeft: "auto",
                  }} />
                )}
              </button>
            )
          })()}

          {/* ─── Sessions ─── */}
          <div style={{
            fontSize: 10,
            fontWeight: 600,
            textTransform: "uppercase" as const,
            letterSpacing: "0.05em",
            color: "rgba(255,255,255,0.2)",
            padding: "10px 12px 4px",
            marginBottom: 2,
          }}>
            Sessions
          </div>

          {/* Regular sessions — exclude home */}
          {sessionsList.filter((s) => s.id !== HOME_SESSION_ID).map((s) => {
            const isActive = s.id === activeSessionId
            const isUnread = !isActive && unreadSessions?.has(s.id)
            const label = s.title || (s.preview ? s.preview.slice(0, 30) : "Untitled")

            return (
              <div
                key={s.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (!isActive) {
                    hapticLight()
                    resumeSession(s.id)
                    if (isMobile) onSidebarClose()
                  }
                }}
                className={`session-row flex items-center gap-3 ${isActive ? "active-session" : ""}`}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: 8,
                  background: isActive ? "var(--color-active-bg)" : "transparent",
                  border: "none",
                  cursor: isActive ? "default" : "pointer",
                  textAlign: "left" as const,
                  marginBottom: 2,
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.03)"
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.background = "transparent"
                }}
              >
                {/* Unread dot */}
                {isUnread && (
                  <span style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "#5BA4F6",
                    flexShrink: 0,
                  }} />
                )}
                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: isUnread ? 600 : 500,
                      color: isActive
                        ? "rgba(255,255,255,0.85)"
                        : isUnread
                          ? "rgba(255,255,255,0.9)"
                          : "rgba(255,255,255,0.5)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap" as const,
                    }}
                  >
                    {label}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "rgba(255,255,255,0.2)",
                      display: "flex",
                      gap: 6,
                    }}
                  >
                    {s.message_count > 0 && <span>{s.message_count} msgs</span>}
                    {s.last_active > 0 && <span>{relativeTime(s.last_active)}</span>}
                  </div>
                </div>

                {/* Delete button */}
                <button
                  aria-label={`Delete session ${label}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    hapticMedium()
                    deleteSession(s.id)
                  }}
                  style={{
                    opacity: 0.15,
                    cursor: "pointer",
                    padding: 8,
                    margin: -8,
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "rgba(255,255,255,0.6)",
                    transition: "opacity 150ms ease, color 150ms ease",
                    background: "transparent",
                    border: "none",
                    minWidth: 36,
                    minHeight: 36,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.opacity = "1"
                    e.currentTarget.style.color = "rgba(239,68,68,0.7)"
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.opacity = "0.15"
                    e.currentTarget.style.color = "rgba(255,255,255,0.6)"
                  }}
                >
                  <X size={12} strokeWidth={2} />
                </button>
              </div>
            )
          })}
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
                    ? "#34C759"
                    : connectionState === "connecting"
                      ? "#F59E0B"
                      : "#EF4444",
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>
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
              color: "rgba(255,255,255,0.2)",
              transition: "color 150ms ease",
              minWidth: 44,
              minHeight: 44,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "rgba(255,255,255,0.5)"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "rgba(255,255,255,0.2)"
            }}
          >
            <Settings size={16} strokeWidth={1.5} />
          </button>
        </div>
      </aside>
    </>
  )
}
