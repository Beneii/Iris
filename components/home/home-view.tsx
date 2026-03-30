"use client"

import * as React from "react"
import { IrisEyeTracking } from "./iris-eye-tracking"
import { type ConnectionState, type SessionInfo, type ActivityEntry } from "@/hooks/use-hermes-bridge"
import { useProviderUsage, type UsageLineProgress } from "@/hooks/use-openusage"

/* ─── Provider definitions ─── */
type ProviderDef = {
  id: string
  label: string
  model: string
  provider: string
  usageId?: string
}

const PROVIDERS: ProviderDef[] = [
  { id: "claude", label: "Claude", model: "claude-opus-4-6", provider: "anthropic", usageId: "claude" },
  { id: "gemini", label: "Gemini", model: "gemini-2.5-pro", provider: "google", usageId: "gemini" },
  { id: "openrouter", label: "OpenRouter", model: "anthropic/claude-sonnet-4", provider: "openrouter" },
]

/* ─── White SVG logos ─── */
function ClaudeLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M16.009 8.06l-5.89 8.05h-2.31L13.699 8.06h2.31zm-8.018 8.05l5.89-8.05h2.31L10.301 16.11H7.991z" fill="currentColor" />
    </svg>
  )
}

function GeminiLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M12 2a10.5 10.5 0 010 20 10.5 10.5 0 010-20z" fill="none" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M12 2c3 4 3 16 0 20M12 2c-3 4-3 16 0 20M2.5 9.5h19M2.5 14.5h19" stroke="currentColor" strokeWidth="1.2" fill="none"/>
    </svg>
  )
}

function OpenRouterLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 512 512" fill="currentColor" stroke="currentColor">
      <path d="M3 248.945C18 248.945 76 236 106 219C136 202 136 202 198 158C276.497 102.293 332 120.945 423 120.945" strokeWidth="50" fill="none"/>
      <path d="M511 121.5L357.25 210.268L357.25 32.7324L511 121.5Z"/>
      <path d="M0 249C15 249 73 261.945 103 278.945C133 295.945 133 295.945 195 339.945C273.497 395.652 329 377 420 377" strokeWidth="50" fill="none"/>
      <path d="M508 376.445L354.25 287.678L354.25 465.213L508 376.445Z"/>
    </svg>
  )
}

const LOGO_MAP: Record<string, React.FC> = {
  claude: ClaudeLogo,
  gemini: GeminiLogo,
  openrouter: OpenRouterLogo,
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
  model: string
  provider: string
  setConfig: (key: string, value: unknown) => void
  contextPressure: number
  activities: ActivityEntry[]
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

function barColor(pct: number): string {
  if (pct >= 80) return "rgba(239,68,68,0.7)"
  if (pct >= 50) return "rgba(245,158,11,0.6)"
  return "rgba(52,199,89,0.5)"
}

const mono: React.CSSProperties = { fontFamily: "var(--font-geist-mono), monospace" }
const dim = (a: number): string => `rgba(255,255,255,${a})`

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
  contextPressure,
  activities,
}: HomeViewProps) {
  const { providers: usageProviders, isAvailable: usageAvailable } = useProviderUsage()

  const switchProvider = React.useCallback((def: ProviderDef) => {
    setConfig("model.default", def.model)
    setConfig("model.provider", def.provider)
  }, [setConfig])

  const isOffline = connectionState !== "connected"
  const statusDot = isOffline ? "#EF4444" : isProcessing ? "#5BA4F6" : "#34C759"
  const statusText = isOffline ? "Offline" : isProcessing ? "Processing" : "Connected"

  const recentSessions = React.useMemo(() =>
    sessionsList
      .filter(s => s.id !== "home" && s.preview)
      .sort((a, b) => b.last_active - a.last_active)
      .slice(0, 4),
    [sessionsList]
  )

  // Recent tool activity (last 6 completed/running)
  const recentActivity = React.useMemo(() =>
    activities
      .filter(a => a.kind !== "status")
      .slice(-6)
      .reverse(),
    [activities]
  )

  const activeModel = model.split("/").pop() || model

  return (
    <div className="home-enter" style={{
      display: "flex", flexDirection: "column", flex: 1,
      minHeight: 0, position: "relative",
    }}>
      {/* Glow */}
      <div style={{
        position: "absolute", top: "5%", left: "50%",
        transform: "translateX(-50%)", width: "90%", height: "50%",
        background: isProcessing
          ? "radial-gradient(ellipse, rgba(91,164,246,0.06) 0%, transparent 70%)"
          : "radial-gradient(ellipse, rgba(255,255,255,0.03) 0%, transparent 70%)",
        pointerEvents: "none", transition: "background 1s ease",
      }} />

      <div style={{
        display: "flex", flexDirection: "column", flex: 1,
        alignItems: "center", justifyContent: "center",
        padding: isMobile ? "12px 16px" : "20px 32px",
        gap: isMobile ? 16 : 20,
        position: "relative", maxWidth: 500, margin: "0 auto", width: "100%",
      }}>

        {/* ═══ Eye + Status ═══ */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <IrisEyeTracking
            size={isMobile ? 80 : 120}
            status={isOffline ? "error" : isProcessing ? "processing" : "idle"}
            connectionState={connectionState}
          />
          {/* Status block */}
          <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase" as const, color: dim(0.25) }}>
              {agentName}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
              <span style={{
                width: 5, height: 5, borderRadius: "50%", background: statusDot,
                boxShadow: !isOffline ? `0 0 6px ${statusDot}` : "none",
                animation: isProcessing ? "preparing-spin 2s linear infinite" : undefined,
              }} />
              <span style={{ fontSize: 10, color: dim(0.45), fontWeight: 500 }}>{statusText}</span>
              <span style={{ fontSize: 9, color: dim(0.15) }}>·</span>
              <span style={{ fontSize: 9, color: dim(0.25), ...mono }}>{activeModel}</span>
            </div>
            {/* Context pressure */}
            {contextPressure > 0 && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 2 }}>
                <span style={{ fontSize: 8, color: dim(0.15), textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>ctx</span>
                <div style={{ width: 60, height: 2, borderRadius: 1, background: dim(0.04), overflow: "hidden" }}>
                  <div style={{
                    width: `${contextPressure}%`, height: "100%", borderRadius: 1,
                    background: contextPressure > 80 ? "rgba(239,68,68,0.5)" : dim(0.15),
                  }} />
                </div>
                <span style={{ fontSize: 8, color: dim(0.12), ...mono }}>{contextPressure}%</span>
              </div>
            )}
          </div>
        </div>

        {/* ═══ Provider Cards ═══ */}
        <div style={{
          display: "flex", gap: 8, width: "100%",
        }}>
          {PROVIDERS.map(def => {
            const isActive = provider === def.provider
              && model.includes(def.model.split("/").pop() || def.model)
            const Logo = LOGO_MAP[def.id]

            const usage = usageAvailable
              ? usageProviders.find(u => u.providerId === def.usageId)
              : undefined
            const progressLines = usage?.lines.filter(
              (l): l is UsageLineProgress => l.type === "progress"
            ) || []
            const mainPct = progressLines.length > 0 && progressLines[0].limit > 0
              ? Math.min((progressLines[0].used / progressLines[0].limit) * 100, 100)
              : null

            return (
              <button
                key={def.id}
                onClick={() => { if (!isActive) switchProvider(def) }}
                style={{
                  flex: 1, display: "flex", flexDirection: "column",
                  padding: "10px 10px 0 10px", borderRadius: 8,
                  background: isActive ? dim(0.04) : dim(0.015),
                  border: `1px solid ${isActive ? dim(0.08) : dim(0.03)}`,
                  cursor: isActive ? "default" : "pointer",
                  transition: "all 150ms ease",
                  overflow: "hidden",
                }}
                onMouseEnter={e => {
                  if (!isActive) {
                    e.currentTarget.style.borderColor = dim(0.08)
                    e.currentTarget.style.background = dim(0.03)
                  }
                }}
                onMouseLeave={e => {
                  if (!isActive) {
                    e.currentTarget.style.borderColor = dim(0.03)
                    e.currentTarget.style.background = dim(0.015)
                  }
                }}
              >
                {/* Header */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <span style={{ color: isActive ? dim(0.7) : dim(0.2), display: "flex" }}>
                    {Logo && <Logo />}
                  </span>
                  <span style={{
                    fontSize: 11, fontWeight: isActive ? 600 : 400,
                    color: isActive ? dim(0.7) : dim(0.3),
                  }}>
                    {def.label}
                  </span>
                  {isActive && (
                    <span style={{
                      width: 4, height: 4, borderRadius: "50%",
                      background: "#34C759", marginLeft: "auto",
                      boxShadow: "0 0 4px rgba(52,199,89,0.5)",
                    }} />
                  )}
                </div>

                {/* Stats */}
                <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 8 }}>
                  {mainPct !== null ? (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 9, color: dim(0.2) }}>Usage</span>
                        <span style={{ fontSize: 9, color: dim(0.35), ...mono }}>{Math.round(mainPct)}%</span>
                      </div>
                      {progressLines.length > 1 && (
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ fontSize: 9, color: dim(0.2) }}>{progressLines[1].label}</span>
                          <span style={{ fontSize: 9, color: dim(0.25), ...mono }}>
                            {Math.round(Math.min((progressLines[1].used / progressLines[1].limit) * 100, 100))}%
                          </span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 9, color: dim(0.15) }}>Usage</span>
                      <span style={{ fontSize: 9, color: dim(0.1), ...mono }}>—</span>
                    </div>
                  )}
                </div>

                {/* Bottom bar */}
                <div style={{
                  height: 2, borderRadius: "0 0 7px 7px",
                  margin: "0 -10px",
                  background: dim(0.03),
                }}>
                  {mainPct !== null && (
                    <div style={{
                      width: `${mainPct}%`, height: "100%",
                      background: barColor(mainPct),
                      transition: "width 600ms ease",
                    }} />
                  )}
                </div>
              </button>
            )
          })}
        </div>

        {/* ═══ Input ═══ */}
        <button
          onClick={onNewSession}
          style={{
            width: "100%", padding: "9px 14px", borderRadius: 8,
            border: `1px solid ${dim(0.04)}`, background: dim(0.015),
            color: dim(0.18), fontSize: 12, textAlign: "left" as const,
            cursor: "pointer", transition: "border-color 150ms ease",
            display: "flex", alignItems: "center", gap: 8,
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = dim(0.1) }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = dim(0.04) }}
        >
          <span style={{ opacity: 0.3, fontSize: 12 }}>→</span>
          <span>Ask {agentName} anything...</span>
        </button>

        {/* ═══ Activity Feed ═══ */}
        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{
            fontSize: 9, fontWeight: 600, textTransform: "uppercase" as const,
            letterSpacing: "0.08em", color: dim(0.12),
          }}>
            Activity
          </div>

          {/* Tool activity from current session */}
          {recentActivity.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {recentActivity.map(a => (
                <div key={a.id} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "4px 6px", borderRadius: 4,
                }}>
                  <span style={{
                    width: 5, height: 5, borderRadius: "50%", flexShrink: 0,
                    background: a.status === "running" ? dim(0.4)
                      : a.status === "error" ? "rgba(239,68,68,0.4)"
                      : dim(0.08),
                    animation: a.status === "running" ? "preparing-spin 1.5s linear infinite" : undefined,
                  }} />
                  <span style={{
                    fontSize: 11, color: a.status === "running" ? dim(0.5) : dim(0.3),
                    flex: 1, overflow: "hidden", textOverflow: "ellipsis",
                    whiteSpace: "nowrap" as const,
                    fontWeight: a.status === "running" ? 500 : 400,
                  }}>
                    {a.title}
                  </span>
                  <span style={{ fontSize: 9, color: dim(0.08), ...mono, flexShrink: 0 }}>
                    {a.timestamp}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Recent sessions */}
          {recentSessions.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 1, marginTop: recentActivity.length > 0 ? 4 : 0 }}>
              {recentActivity.length > 0 && (
                <div style={{
                  fontSize: 9, fontWeight: 600, textTransform: "uppercase" as const,
                  letterSpacing: "0.08em", color: dim(0.1), marginBottom: 2,
                }}>
                  Sessions
                </div>
              )}
              {recentSessions.map(s => (
                <button
                  key={s.id}
                  onClick={() => resumeSession(s.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "4px 6px", borderRadius: 4, background: "transparent",
                    border: "none", cursor: "pointer", textAlign: "left" as const,
                    width: "100%", transition: "background 100ms ease",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = dim(0.02) }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent" }}
                >
                  <span style={{ width: 4, height: 4, borderRadius: "50%", background: dim(0.08), flexShrink: 0 }} />
                  <span style={{
                    fontSize: 11, color: dim(0.3), flex: 1,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
                  }}>
                    {s.title || s.preview}
                  </span>
                  <span style={{ fontSize: 9, color: dim(0.08), ...mono, flexShrink: 0 }}>
                    {relativeTime(s.last_active)}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Empty state */}
          {recentActivity.length === 0 && recentSessions.length === 0 && (
            <div style={{ padding: "12px 0", textAlign: "center" as const }}>
              <span style={{ fontSize: 11, color: dim(0.1) }}>No activity yet</span>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
