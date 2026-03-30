"use client"

import * as React from "react"
import { IrisEyeTracking } from "./iris-eye-tracking"
import Composer from "@/components/chat/composer"
import { CommandPalette, type Command } from "@/components/command-palette"
import { HOME_SESSION_ID, type ConnectionState, type SessionInfo, type HermesMessage } from "@/hooks/use-hermes-bridge"
import { hapticLight } from "@/lib/haptics"
import { MessageList } from "@/components/chat/message-entry"

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

/* ─── Stats ─── */
type DashboardStats = {
  sessions: number
  messages: number
  cost: string
}

/* ─── Props ─── */
interface HomeViewProps {
  connectionState: ConnectionState
  isProcessing: boolean
  sessionsList: SessionInfo[]
  messages: HermesMessage[]
  agentName: string
  isMobile?: boolean
  // Composer
  composerValue: string
  onComposerChange: (val: string) => void
  onSend: () => void
  onCancel: () => void
  showCommandPalette: boolean
  onCommandPaletteChange: (v: boolean) => void
  onCommandSelect: (cmd: Command) => void
  attachments: { name: string; type: string; url: string }[]
  onFilesAttached: (files: File[]) => void
  onRemoveAttachment: (index: number) => void
  // Navigation
  resumeSession: (id: string) => void
}

/* ─── Helpers ─── */
function relativeTime(ts: number): string {
  if (!ts) return ""
  const nowSec = Date.now() / 1000
  const diff = nowSec - ts
  if (diff < 60) return "just now"
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 172800) return "Yesterday"
  return `${Math.floor(diff / 86400)}d ago`
}

const NOTIFICATION_ICONS: Record<NotificationType, string> = {
  info: "◆",
  success: "✔",
  warning: "⚠",
  error: "✖",
  approval: "◎",
}

const NOTIFICATION_COLORS: Record<NotificationType, string> = {
  info: "rgba(255, 255, 255, 0.4)",
  success: "rgba(52, 199, 89, 0.7)",
  warning: "rgba(245, 158, 11, 0.7)",
  error: "rgba(239, 68, 68, 0.7)",
  approval: "rgba(91, 164, 246, 0.7)",
}

/* ─── Mock notifications (will be replaced by bridge data) ─── */
function getMockNotifications(): HomeNotification[] {
  const now = Date.now() / 1000
  return [
    {
      id: "n-1",
      type: "success",
      title: "Self-improvement completed",
      body: "Extracted 3 new learnings, updated 1 skill",
      source: "daemon",
      timestamp: now - 7200,
      read: false,
    },
    {
      id: "n-2",
      type: "info",
      title: "Memory decay ran",
      body: "2 memories flagged, 0 removed",
      source: "daemon",
      timestamp: now - 14400,
      read: true,
    },
    {
      id: "n-3",
      type: "warning",
      title: "Context pressure high",
      body: "Session 'debug api' at 87% — consider compacting",
      sessionId: "session-abc",
      source: "system",
      timestamp: now - 28800,
      read: true,
    },
    {
      id: "n-4",
      type: "approval",
      title: "Push to main?",
      body: "Hermes wants to merge iris-home-view branch",
      sessionId: "session-def",
      source: "session",
      timestamp: now - 3600,
      read: false,
    },
  ]
}

/* ─── Component ─── */
export default function HomeView({
  connectionState,
  isProcessing,
  sessionsList,
  messages,
  agentName,
  isMobile = false,
  composerValue,
  onComposerChange,
  onSend,
  onCancel,
  showCommandPalette,
  onCommandPaletteChange,
  onCommandSelect,
  attachments,
  onFilesAttached,
  onRemoveAttachment,
  resumeSession,
}: HomeViewProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const [notifications] = React.useState<HomeNotification[]>(getMockNotifications)
  const [showChat, setShowChat] = React.useState(false)

  // Stats derived from bridge data
  const stats: DashboardStats = React.useMemo(() => ({
    sessions: sessionsList.filter(s => s.id !== HOME_SESSION_ID).length,
    messages: sessionsList.reduce((sum, s) => sum + (s.message_count || 0), 0),
    cost: "$0.00",
  }), [sessionsList])

  // When there are messages in the home session, show the chat section
  React.useEffect(() => {
    if (messages.length > 0) setShowChat(true)
  }, [messages.length])

  const paletteQuery = showCommandPalette && composerValue.startsWith("/")
    ? composerValue.slice(1)
    : ""

  return (
    <div className="flex flex-col flex-1 min-w-0" style={{ overflow: "hidden" }}>
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto"
        style={{ overflowX: "hidden", WebkitOverflowScrolling: "touch", overscrollBehavior: "contain" }}
      >
        <div className="mx-auto" style={{ maxWidth: 640, padding: "0 24px" }}>

          {/* ─── Hero: Eye ─── */}
          <div style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            paddingTop: isMobile ? 28 : 48,
            paddingBottom: isMobile ? 16 : 24,
            gap: 16,
          }}>
            <IrisEyeTracking
              size={isMobile ? 160 : 220}
              status={connectionState !== "connected" ? "error" : isProcessing ? "processing" : "idle"}
              connectionState={connectionState}
            />
            <div style={{
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: "0.05em",
              textTransform: "uppercase" as const,
              color: connectionState !== "connected"
                ? "rgba(239, 68, 68, 0.6)"
                : isProcessing
                  ? "rgba(91, 164, 246, 0.6)"
                  : "rgba(255, 255, 255, 0.2)",
              transition: "color 400ms ease",
            }}>
              {connectionState !== "connected"
                ? "Disconnected"
                : isProcessing
                  ? "Processing..."
                  : "Watching"}
            </div>
          </div>

          {/* ─── Stats Row ─── */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: isMobile ? 8 : 12,
            marginBottom: isMobile ? 24 : 32,
          }}>
            {[
              { label: "Sessions", value: stats.sessions.toString() },
              { label: "Messages", value: stats.messages.toString() },
              { label: "Cost Today", value: stats.cost },
            ].map((stat) => (
              <div
                key={stat.label}
                style={{
                  background: "rgba(255, 255, 255, 0.02)",
                  border: "1px solid rgba(255, 255, 255, 0.04)",
                  borderRadius: 10,
                  padding: isMobile ? "10px 8px" : "14px 16px",
                  textAlign: "center" as const,
                }}
              >
                <div style={{
                  fontSize: isMobile ? 18 : 22,
                  fontWeight: 600,
                  color: "rgba(255, 255, 255, 0.8)",
                  fontFamily: "var(--font-geist-mono), monospace",
                  lineHeight: 1.2,
                }}>
                  {stat.value}
                </div>
                <div style={{
                  fontSize: isMobile ? 9 : 10,
                  fontWeight: 500,
                  textTransform: "uppercase" as const,
                  letterSpacing: "0.06em",
                  color: "rgba(255, 255, 255, 0.2)",
                  marginTop: 4,
                }}>
                  {stat.label}
                </div>
              </div>
            ))}
          </div>

          {/* ─── Notifications ─── */}
          <div style={{ marginBottom: 24 }}>
            <div style={{
              fontSize: 10,
              fontWeight: 600,
              textTransform: "uppercase" as const,
              letterSpacing: "0.06em",
              color: "rgba(255, 255, 255, 0.2)",
              marginBottom: 10,
            }}>
              Recent Activity
            </div>

            {notifications.length === 0 ? (
              <div style={{
                padding: "20px 0",
                textAlign: "center" as const,
                fontSize: 13,
                color: "rgba(255, 255, 255, 0.15)",
              }}>
                No notifications yet
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {notifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => {
                      if (n.sessionId) {
                        hapticLight()
                        resumeSession(n.sessionId)
                      }
                    }}
                    className="home-notification"
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                      padding: "10px 12px",
                      borderRadius: 8,
                      background: n.read ? "transparent" : "rgba(255, 255, 255, 0.015)",
                      border: "none",
                      cursor: n.sessionId ? "pointer" : "default",
                      textAlign: "left" as const,
                      width: "100%",
                      transition: "background 120ms ease",
                    }}
                    onMouseEnter={(e) => {
                      if (n.sessionId) e.currentTarget.style.background = "rgba(255,255,255,0.03)"
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = n.read ? "transparent" : "rgba(255,255,255,0.015)"
                    }}
                  >
                    {/* Icon */}
                    <span style={{
                      fontSize: 12,
                      color: NOTIFICATION_COLORS[n.type],
                      flexShrink: 0,
                      marginTop: 1,
                      width: 14,
                      textAlign: "center" as const,
                    }}>
                      {NOTIFICATION_ICONS[n.type]}
                    </span>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 13,
                        fontWeight: n.read ? 400 : 500,
                        color: n.read ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.7)",
                        lineHeight: 1.4,
                      }}>
                        {n.title}
                      </div>
                      {n.body && (
                        <div style={{
                          fontSize: 12,
                          color: "rgba(255,255,255,0.2)",
                          marginTop: 2,
                          lineHeight: 1.35,
                        }}>
                          {n.body}
                        </div>
                      )}
                    </div>

                    {/* Timestamp + link indicator */}
                    <div style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      flexShrink: 0,
                    }}>
                      <span style={{
                        fontSize: 11,
                        color: "rgba(255,255,255,0.12)",
                        whiteSpace: "nowrap" as const,
                      }}>
                        {relativeTime(n.timestamp)}
                      </span>
                      {n.sessionId && (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="2" strokeLinecap="round">
                          <path d="M9 18l6-6-6-6" />
                        </svg>
                      )}
                    </div>

                    {/* Unread dot — positioned via the parent's position:relative from .home-notification */}
                    {!n.read && (
                      <span style={{
                        position: "absolute",
                        left: 2,
                        top: "50%",
                        transform: "translateY(-50%)",
                        width: 4,
                        height: 4,
                        borderRadius: "50%",
                        background: "#5BA4F6",
                      }} />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ─── Chat Messages (if any) ─── */}
          {showChat && messages.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{
                fontSize: 10,
                fontWeight: 600,
                textTransform: "uppercase" as const,
                letterSpacing: "0.06em",
                color: "rgba(255, 255, 255, 0.2)",
                marginBottom: 10,
              }}>
                Chat
              </div>
              <MessageList messages={messages} agentName={agentName} />
            </div>
          )}

        </div>
      </div>

      {/* ─── Composer ─── */}
      <div className="flex-shrink-0 px-4" style={{ paddingTop: 6, paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }}>
        <div className="mx-auto" style={{ maxWidth: 640, position: "relative" }}>
          <CommandPalette
            query={paletteQuery}
            visible={showCommandPalette}
            onSelect={onCommandSelect}
            onClose={() => {
              onCommandPaletteChange(false)
              onComposerChange("")
            }}
          />
          <Composer
            value={composerValue}
            onChange={(val) => {
              onComposerChange(val)
              if (val.startsWith("/") && !showCommandPalette) onCommandPaletteChange(true)
              if (!val.startsWith("/") && showCommandPalette) onCommandPaletteChange(false)
            }}
            onSend={onSend}
            isProcessing={isProcessing}
            showCommandPalette={showCommandPalette}
            onCommandPaletteChange={onCommandPaletteChange}
            attachments={attachments}
            onFilesAttached={onFilesAttached}
            onRemoveAttachment={onRemoveAttachment}
            onCancel={onCancel}
          />
        </div>
      </div>
    </div>
  )
}
