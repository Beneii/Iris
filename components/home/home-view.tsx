"use client"

import * as React from "react"
import { IrisEyeTracking } from "./iris-eye-tracking"
import { HOME_SESSION_ID, type ConnectionState, type SessionInfo } from "@/hooks/use-hermes-bridge"

/* ─── Notification Type ─── */
export type NotificationType = "info" | "success" | "warning" | "error" | "approval"

export type HomeNotification = {
  id: string
  type: NotificationType
  title: string
  body?: string
  sessionId?: string
  source: string
  timestamp: number
  read: boolean
}

/* ─── Props ─── */
interface HomeViewProps {
  connectionState: ConnectionState
  isProcessing: boolean
  sessionsList: SessionInfo[]
  agentName: string
  isMobile?: boolean
  resumeSession: (id: string) => void
  onNewSession: () => void
}

/* ─── Helpers ─── */
function relativeTime(ts: number): string {
  if (!ts) return ""
  const diff = Date.now() / 1000 - ts
  if (diff < 60) return "now"
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}d`
}

const NOTIF_ICON: Record<NotificationType, string> = {
  info: "◆", success: "✔", warning: "⚠", error: "✖", approval: "◎",
}
const NOTIF_COLOR: Record<NotificationType, string> = {
  info: "rgba(255,255,255,0.35)",
  success: "#34C759",
  warning: "#F59E0B",
  error: "#EF4444",
  approval: "#5BA4F6",
}

/* ─── Mock notifications ─── */
function getMockNotifications(): HomeNotification[] {
  const now = Date.now() / 1000
  return [
    { id: "n1", type: "success", title: "Self-improvement completed", body: "3 learnings, 1 skill updated", source: "daemon", timestamp: now - 7200, read: false },
    { id: "n2", type: "info", title: "Memory decay ran", body: "2 flagged, 0 removed", source: "daemon", timestamp: now - 14400, read: true },
    { id: "n3", type: "approval", title: "Push to main?", body: "iris-home-view branch", sessionId: "session-def", source: "session", timestamp: now - 3600, read: false },
  ]
}

/* ─── Component ─── */
export default function HomeView({
  connectionState,
  isProcessing,
  sessionsList,
  agentName,
  isMobile = false,
  resumeSession,
  onNewSession,
}: HomeViewProps) {
  const [notifications] = React.useState<HomeNotification[]>(getMockNotifications)

  const stats = React.useMemo(() => ({
    sessions: sessionsList.filter(s => s.id !== HOME_SESSION_ID).length,
    messages: sessionsList.reduce((sum, s) => sum + (s.message_count || 0), 0),
  }), [sessionsList])

  const isError = connectionState !== "connected"
  const statusLabel = isError ? "Offline" : isProcessing ? "Processing" : "Watching"
  const statusColor = isError ? "#EF4444" : isProcessing ? "#5BA4F6" : "rgba(255,255,255,0.25)"

  return (
    <div className="home-enter" style={{
      display: "flex",
      flexDirection: "column",
      flex: 1,
      minHeight: 0,
      overflow: "hidden",
    }}>
      {/* ─── Background glow ─── */}
      <div style={{
        position: "absolute",
        top: "-20%",
        left: "50%",
        transform: "translateX(-50%)",
        width: "80%",
        height: "60%",
        background: isProcessing
          ? "radial-gradient(ellipse, rgba(91,164,246,0.06) 0%, transparent 70%)"
          : "radial-gradient(ellipse, rgba(255,255,255,0.02) 0%, transparent 70%)",
        pointerEvents: "none",
        transition: "background 1s ease",
      }} />

      <div style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: isMobile ? "16px 20px" : "24px 32px",
        gap: isMobile ? 20 : 28,
        position: "relative",
        maxWidth: 560,
        margin: "0 auto",
        width: "100%",
      }}>

        {/* ─── Eye ─── */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <IrisEyeTracking
            size={isMobile ? 120 : 180}
            status={isError ? "error" : isProcessing ? "processing" : "idle"}
            connectionState={connectionState}
          />
          <span style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.12em",
            textTransform: "uppercase" as const,
            color: statusColor,
            transition: "color 400ms ease",
          }}>
            {statusLabel}
          </span>
        </div>

        {/* ─── Stats ─── */}
        <div style={{
          display: "flex",
          gap: isMobile ? 16 : 32,
          justifyContent: "center",
        }}>
          {[
            { value: stats.sessions, label: "sessions" },
            { value: stats.messages, label: "messages" },
          ].map(s => (
            <div key={s.label} style={{ textAlign: "center" as const }}>
              <div style={{
                fontSize: isMobile ? 20 : 26,
                fontWeight: 600,
                color: "rgba(255,255,255,0.8)",
                fontFamily: "var(--font-geist-mono), monospace",
                lineHeight: 1,
              }}>
                {s.value}
              </div>
              <div style={{
                fontSize: 9,
                fontWeight: 500,
                textTransform: "uppercase" as const,
                letterSpacing: "0.08em",
                color: "rgba(255,255,255,0.18)",
                marginTop: 4,
              }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>

        {/* ─── Command bar ─── */}
        <button
          onClick={onNewSession}
          style={{
            width: "100%",
            maxWidth: 400,
            padding: "10px 16px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.06)",
            background: "rgba(255,255,255,0.02)",
            color: "rgba(255,255,255,0.2)",
            fontSize: 13,
            textAlign: "left" as const,
            cursor: "pointer",
            transition: "border-color 150ms ease, background 150ms ease",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"
            e.currentTarget.style.background = "rgba(255,255,255,0.03)"
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)"
            e.currentTarget.style.background = "rgba(255,255,255,0.02)"
          }}
        >
          <span style={{ opacity: 0.3, fontSize: 14 }}>→</span>
          Ask {agentName} anything...
        </button>

        {/* ─── Activity feed ─── */}
        <div style={{ width: "100%", maxWidth: 400 }}>
          <div style={{
            fontSize: 9,
            fontWeight: 600,
            textTransform: "uppercase" as const,
            letterSpacing: "0.08em",
            color: "rgba(255,255,255,0.15)",
            marginBottom: 8,
          }}>
            Activity
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {notifications.slice(0, isMobile ? 3 : 4).map(n => (
              <button
                key={n.id}
                onClick={() => n.sessionId && resumeSession(n.sessionId)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "7px 8px",
                  borderRadius: 6,
                  background: "transparent",
                  border: "none",
                  cursor: n.sessionId ? "pointer" : "default",
                  textAlign: "left" as const,
                  width: "100%",
                  transition: "background 100ms ease",
                }}
                onMouseEnter={e => { if (n.sessionId) e.currentTarget.style.background = "rgba(255,255,255,0.03)" }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent" }}
              >
                <span style={{ fontSize: 10, color: NOTIF_COLOR[n.type], width: 12, textAlign: "center" as const, flexShrink: 0 }}>
                  {NOTIF_ICON[n.type]}
                </span>
                <span style={{
                  fontSize: 12,
                  color: n.read ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.55)",
                  fontWeight: n.read ? 400 : 500,
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap" as const,
                }}>
                  {n.title}
                </span>
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.1)", flexShrink: 0 }}>
                  {relativeTime(n.timestamp)}
                </span>
              </button>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
