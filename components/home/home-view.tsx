"use client"

import * as React from "react"
import { IrisEyeTracking } from "./iris-eye-tracking"
import { type ConnectionState, type SessionInfo } from "@/hooks/use-hermes-bridge"
import { useProviderUsage, type ProviderUsage, type UsageLineProgress } from "@/hooks/use-openusage"

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

/* ─── Provider presets (what Hermes can switch between) ─── */
type ProviderPreset = {
  label: string
  model: string
  provider: string
  /** OpenUsage providerId to match against, if any */
  usageId?: string
}

const PROVIDER_PRESETS: ProviderPreset[] = [
  { label: "Claude", model: "claude-opus-4-6", provider: "anthropic", usageId: "claude" },
  { label: "Gemini", model: "gemini-2.5-pro", provider: "google", usageId: "gemini" },
  { label: "OpenRouter", model: "anthropic/claude-sonnet-4", provider: "openrouter" },
]

/* ─── Props ─── */
interface HomeViewProps {
  connectionState: ConnectionState
  isProcessing: boolean
  sessionsList: SessionInfo[]
  agentName: string
  isMobile?: boolean
  resumeSession: (id: string) => void
  onNewSession: () => void
  model: string
  provider: string
  setConfig: (key: string, value: unknown) => void
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
  model,
  provider,
  setConfig,
}: HomeViewProps) {
  const [notifications] = React.useState<HomeNotification[]>(getMockNotifications)
  const { providers, isAvailable: usageAvailable } = useProviderUsage()

  const switchProvider = React.useCallback((preset: ProviderPreset) => {
    setConfig("model.default", preset.model)
    setConfig("model.provider", preset.provider)
  }, [setConfig])

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
        padding: isMobile ? "12px 20px" : "24px 32px",
        gap: isMobile ? 16 : 24,
        position: "relative",
        maxWidth: 560,
        margin: "0 auto",
        width: "100%",
      }}>

        {/* ─── Eye ─── */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: isMobile ? 6 : 10 }}>
          <IrisEyeTracking
            size={isMobile ? 100 : 180}
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

        {/* ─── Provider Usage + Quick Switch ─── */}
        <div style={{
          width: "100%",
          maxWidth: 400,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}>
          {/* Usage cards from OpenUsage */}
          {usageAvailable && providers.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {providers.map(p => (
                <UsageCard key={p.providerId} provider={p} compact={isMobile} />
              ))}
            </div>
          )}

          {/* Provider quick-switch */}
          <div>
            <div style={{
              fontSize: 9,
              fontWeight: 600,
              textTransform: "uppercase" as const,
              letterSpacing: "0.08em",
              color: "rgba(255,255,255,0.15)",
              marginBottom: 6,
            }}>
              Provider
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {PROVIDER_PRESETS.map(preset => {
                const isActive = provider === preset.provider && model.includes(preset.model.split("/").pop() || preset.model)
                // Check if this provider is running low in OpenUsage
                const usage = usageAvailable
                  ? providers.find(u => u.providerId === preset.usageId)
                  : undefined
                const mainProgress = usage?.lines.find((l): l is UsageLineProgress => l.type === "progress")
                const pct = mainProgress && mainProgress.limit > 0
                  ? (mainProgress.used / mainProgress.limit) * 100
                  : null
                const isLow = pct !== null && pct >= 80

                return (
                  <button
                    key={preset.label}
                    onClick={() => { if (!isActive) switchProvider(preset) }}
                    style={{
                      padding: "5px 12px",
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: isActive ? 600 : 400,
                      color: isActive
                        ? "rgba(255,255,255,0.85)"
                        : isLow
                          ? "rgba(245,158,11,0.7)"
                          : "rgba(255,255,255,0.35)",
                      background: isActive
                        ? "rgba(255,255,255,0.08)"
                        : "rgba(255,255,255,0.02)",
                      border: isActive
                        ? "1px solid rgba(255,255,255,0.15)"
                        : "1px solid rgba(255,255,255,0.04)",
                      cursor: isActive ? "default" : "pointer",
                      transition: "all 150ms ease",
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                    onMouseEnter={e => {
                      if (!isActive) {
                        e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"
                        e.currentTarget.style.background = "rgba(255,255,255,0.04)"
                      }
                    }}
                    onMouseLeave={e => {
                      if (!isActive) {
                        e.currentTarget.style.borderColor = "rgba(255,255,255,0.04)"
                        e.currentTarget.style.background = "rgba(255,255,255,0.02)"
                      }
                    }}
                  >
                    {isActive && (
                      <span style={{
                        width: 4, height: 4, borderRadius: "50%",
                        background: "rgba(52,199,89,0.7)", flexShrink: 0,
                      }} />
                    )}
                    {preset.label}
                    {isLow && !isActive && (
                      <span style={{ fontSize: 9, color: "rgba(245,158,11,0.5)" }}>
                        {Math.round(pct!)}%
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
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
                  padding: isMobile ? "5px 6px" : "7px 8px",
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


/* ═══════════════════════════════════════════════
   Usage Card — renders one OpenUsage provider
   ═══════════════════════════════════════════════ */

function getBarColor(pct: number): string {
  if (pct >= 90) return "rgba(239,68,68,0.7)"
  if (pct >= 70) return "rgba(245,158,11,0.6)"
  return "rgba(255,255,255,0.25)"
}

function formatResetTime(resetsAt?: string | null): string {
  if (!resetsAt) return ""
  const diff = new Date(resetsAt).getTime() - Date.now()
  if (diff <= 0) return "resetting"
  const hrs = Math.floor(diff / 3_600_000)
  const mins = Math.floor((diff % 3_600_000) / 60_000)
  if (hrs > 0) return `${hrs}h ${mins}m`
  return `${mins}m`
}

function UsageCard({ provider, compact }: { provider: ProviderUsage; compact?: boolean }) {
  const progressLines = provider.lines.filter(
    (l): l is UsageLineProgress => l.type === "progress"
  )
  const textLines = provider.lines.filter(l => l.type === "text")

  return (
    <div style={{
      padding: compact ? "8px 10px" : "10px 14px",
      borderRadius: 8,
      background: "rgba(255,255,255,0.02)",
      border: "1px solid rgba(255,255,255,0.04)",
      transition: "border-color 150ms ease",
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)" }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.04)" }}
    >
      {/* Header: provider name + plan */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: progressLines.length > 0 ? 8 : 0,
      }}>
        <span style={{
          fontSize: 12,
          fontWeight: 600,
          color: "rgba(255,255,255,0.65)",
          letterSpacing: "0.01em",
        }}>
          {provider.displayName}
        </span>
        {provider.plan && (
          <span style={{
            fontSize: 9,
            color: "rgba(255,255,255,0.2)",
            fontFamily: "var(--font-geist-mono), monospace",
          }}>
            {provider.plan}
          </span>
        )}
      </div>

      {/* Progress bars */}
      {progressLines.map((line, i) => {
        const pct = line.limit > 0 ? Math.min((line.used / line.limit) * 100, 100) : 0
        const resetStr = formatResetTime(line.resetsAt)
        return (
          <div key={i} style={{ marginBottom: i < progressLines.length - 1 ? 6 : 0 }}>
            <div style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              marginBottom: 3,
            }}>
              <span style={{
                fontSize: 10,
                color: "rgba(255,255,255,0.3)",
              }}>
                {line.label}
              </span>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{
                  fontSize: 10,
                  color: "rgba(255,255,255,0.4)",
                  fontFamily: "var(--font-geist-mono), monospace",
                }}>
                  {Math.round(pct)}%
                </span>
                {resetStr && (
                  <span style={{
                    fontSize: 9,
                    color: "rgba(255,255,255,0.12)",
                    fontFamily: "var(--font-geist-mono), monospace",
                  }}>
                    {resetStr}
                  </span>
                )}
              </div>
            </div>
            {/* Bar */}
            <div style={{
              width: "100%",
              height: 3,
              borderRadius: 2,
              background: "rgba(255,255,255,0.04)",
              overflow: "hidden",
            }}>
              <div style={{
                width: `${pct}%`,
                height: "100%",
                borderRadius: 2,
                background: getBarColor(pct),
                transition: "width 600ms ease, background 300ms ease",
              }} />
            </div>
          </div>
        )
      })}

      {/* Text/badge lines */}
      {textLines.length > 0 && (
        <div style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "4px 12px",
          marginTop: progressLines.length > 0 ? 6 : 0,
        }}>
          {textLines.map((line, i) => (
            <span key={i} style={{
              fontSize: 10,
              color: "rgba(255,255,255,0.25)",
              fontFamily: "var(--font-geist-mono), monospace",
            }}>
              <span style={{ color: "rgba(255,255,255,0.15)" }}>{line.label}: </span>
              {"value" in line ? line.value : ""}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
