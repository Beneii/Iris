"use client"

import * as React from "react"
import { IrisEyeTracking } from "./iris-eye-tracking"
import { type ConnectionState, type SessionInfo } from "@/hooks/use-hermes-bridge"
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

/* ─── SVG logos (white, 20×20) ─── */
function ClaudeLogo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M16.009 8.06l-5.89 8.05h-2.31L13.699 8.06h2.31zm-8.018 8.05l5.89-8.05h2.31L10.301 16.11H7.991z" fill="currentColor" />
    </svg>
  )
}

function GeminiLogo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 2C12 2 14.5 7.5 17.5 10.5C20.5 13.5 22 16 22 16C22 16 16.5 13.5 13.5 13.5C10.5 13.5 2 22 2 22C2 22 9.5 14.5 9.5 11.5C9.5 8.5 12 2 12 2Z" fill="currentColor" />
    </svg>
  )
}

function OpenRouterLogo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 3L3 8v8l9 5 9-5V8l-9-5zm0 2.18L18.36 8.5 12 11.82 5.64 8.5 12 5.18zM5 9.82l6 3.33v6.03l-6-3.33V9.82zm8 9.36v-6.03l6-3.33v6.03l-6 3.33z" fill="currentColor" />
    </svg>
  )
}

const LOGO_MAP: Record<string, React.FC<{ size?: number }>> = {
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

function getBarColor(pct: number): string {
  if (pct >= 90) return "rgba(239,68,68,0.7)"
  if (pct >= 70) return "rgba(245,158,11,0.6)"
  return "rgba(255,255,255,0.3)"
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
  const { providers: usageProviders, isAvailable: usageAvailable } = useProviderUsage()

  const switchProvider = React.useCallback((def: ProviderDef) => {
    setConfig("model.default", def.model)
    setConfig("model.provider", def.provider)
  }, [setConfig])

  const isError = connectionState !== "connected"
  const statusLabel = isError ? "Offline" : isProcessing ? "Processing" : "Watching"
  const statusColor = isError ? "#EF4444" : isProcessing ? "#5BA4F6" : "rgba(255,255,255,0.25)"

  // Real recent sessions (exclude home, limit to 5)
  const recentSessions = React.useMemo(() => {
    return sessionsList
      .filter(s => s.id !== "home" && s.preview)
      .sort((a, b) => b.last_active - a.last_active)
      .slice(0, 5)
  }, [sessionsList])

  return (
    <div className="home-enter" style={{
      display: "flex",
      flexDirection: "column",
      flex: 1,
      minHeight: 0,
      position: "relative",
    }}>
      {/* ─── Background glow ─── */}
      <div style={{
        position: "absolute",
        top: "5%",
        left: "50%",
        transform: "translateX(-50%)",
        width: "90%",
        height: "50%",
        background: isProcessing
          ? "radial-gradient(ellipse, rgba(91,164,246,0.06) 0%, transparent 70%)"
          : "radial-gradient(ellipse, rgba(255,255,255,0.03) 0%, transparent 70%)",
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
        gap: isMobile ? 20 : 28,
        position: "relative",
        maxWidth: 480,
        margin: "0 auto",
        width: "100%",
      }}>

        {/* ─── Eye ─── */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: isMobile ? 6 : 10 }}>
          <IrisEyeTracking
            size={isMobile ? 100 : 160}
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

        {/* ─── Provider selector with usage bars ─── */}
        <div style={{
          display: "flex",
          gap: isMobile ? 20 : 32,
          justifyContent: "center",
        }}>
          {PROVIDERS.map(def => {
            const isActive = provider === def.provider
              && model.includes(def.model.split("/").pop() || def.model)
            const Logo = LOGO_MAP[def.id]

            // Get usage bar for this provider
            const usage = usageAvailable
              ? usageProviders.find(u => u.providerId === def.usageId)
              : undefined
            const mainProgress = usage?.lines.find(
              (l): l is UsageLineProgress => l.type === "progress"
            )
            const pct = mainProgress && mainProgress.limit > 0
              ? Math.min((mainProgress.used / mainProgress.limit) * 100, 100)
              : null

            return (
              <button
                key={def.id}
                onClick={() => { if (!isActive) switchProvider(def) }}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 6,
                  background: "none",
                  border: "none",
                  cursor: isActive ? "default" : "pointer",
                  padding: "4px 0",
                  minWidth: 56,
                }}
              >
                {/* Logo */}
                <div style={{
                  color: isActive ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.2)",
                  transition: "color 200ms ease",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 32,
                  height: 32,
                }}>
                  {Logo && <Logo size={22} />}
                </div>

                {/* Label */}
                <span style={{
                  fontSize: 9,
                  fontWeight: isActive ? 600 : 400,
                  letterSpacing: "0.04em",
                  color: isActive ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.18)",
                  transition: "color 200ms ease",
                  textTransform: "uppercase" as const,
                }}>
                  {def.label}
                </span>

                {/* Usage bar */}
                <div style={{
                  width: 48,
                  height: 2,
                  borderRadius: 1,
                  background: "rgba(255,255,255,0.04)",
                  overflow: "hidden",
                }}>
                  {pct !== null ? (
                    <div style={{
                      width: `${pct}%`,
                      height: "100%",
                      borderRadius: 1,
                      background: isActive ? getBarColor(pct) : "rgba(255,255,255,0.1)",
                      transition: "width 600ms ease",
                    }} />
                  ) : isActive ? (
                    <div style={{
                      width: "100%",
                      height: "100%",
                      borderRadius: 1,
                      background: "rgba(255,255,255,0.12)",
                    }} />
                  ) : null}
                </div>
              </button>
            )
          })}
        </div>

        {/* ─── Command bar ─── */}
        <button
          onClick={onNewSession}
          style={{
            width: "100%",
            maxWidth: 380,
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

        {/* ─── Recent activity (real sessions) ─── */}
        {recentSessions.length > 0 && (
          <div style={{ width: "100%", maxWidth: 380 }}>
            <div style={{
              fontSize: 9,
              fontWeight: 600,
              textTransform: "uppercase" as const,
              letterSpacing: "0.08em",
              color: "rgba(255,255,255,0.12)",
              marginBottom: 6,
            }}>
              Recent
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {recentSessions.map(s => (
                <button
                  key={s.id}
                  onClick={() => resumeSession(s.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "6px 8px",
                    borderRadius: 6,
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left" as const,
                    width: "100%",
                    transition: "background 100ms ease",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.03)" }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent" }}
                >
                  {/* Dot */}
                  <span style={{
                    width: 4, height: 4, borderRadius: "50%",
                    background: "rgba(255,255,255,0.12)", flexShrink: 0,
                  }} />
                  {/* Title/preview */}
                  <span style={{
                    fontSize: 12,
                    color: "rgba(255,255,255,0.4)",
                    fontWeight: 400,
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap" as const,
                  }}>
                    {s.title || s.preview}
                  </span>
                  {/* Time */}
                  <span style={{
                    fontSize: 10,
                    color: "rgba(255,255,255,0.1)",
                    fontFamily: "var(--font-geist-mono), monospace",
                    flexShrink: 0,
                  }}>
                    {relativeTime(s.last_active)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
