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
  { id: "codex", label: "Codex", model: "codex-mini", provider: "openai", usageId: "codex" },
  { id: "gemini", label: "Gemini", model: "gemini-2.5-pro", provider: "google", usageId: "gemini" },
]

/* ─── Real SVG logos (white, currentColor) ─── */
function ClaudeLogo() {
  return (
    <svg width="16" height="16" viewBox="0 0 100 100" fill="none">
      <path d="M25.7146 63.2153L41.4393 54.3917L41.7025 53.6226L41.4393 53.1976H40.6705L38.0394 53.0359L29.054 52.7929L21.2624 52.4691L13.7134 52.0644L11.8111 51.6594L10.0303 49.3118L10.2123 48.138L11.8111 47.0657L14.0981 47.2681L19.1574 47.6119L26.7467 48.138L32.2516 48.4618L40.4073 49.3118H41.7025L41.8846 48.7857L41.4393 48.4618L41.0955 48.138L33.243 42.8155L24.7432 37.1894L20.2909 33.9513L17.8824 32.3119L16.6684 30.774L16.1422 27.4147L18.328 25.0062L21.2624 25.2088L22.0112 25.4112L24.9861 27.6979L31.3407 32.616L39.6381 38.7273L40.8525 39.7391L41.3381 39.395L41.399 39.1523L40.8525 38.2415L36.3394 30.0858L31.5227 21.7883L29.3775 18.3478L28.811 16.2837C28.6087 15.4334 28.4669 14.7252 28.4669 13.8549L30.9563 10.4753L32.3321 10.0303L35.6515 10.4756L37.0479 11.6897L39.112 16.4052L42.4513 23.8327L47.6321 33.9313L49.15 36.9265L49.9594 39.6991L50.2632 40.5491H50.7894V40.0632L51.2141 34.3766L52.0035 27.3944L52.7726 18.4087L53.0358 15.8793L54.2905 12.8435L56.7795 11.2041L58.7224 12.135L60.3212 14.422L60.0986 15.899L59.1474 22.0718L57.2857 31.7458L56.0713 38.2218H56.7795L57.5892 37.4121L60.8677 33.061L66.3723 26.18L68.801 23.448L71.6342 20.4325L73.4556 18.9957H76.8962L79.4255 22.7601L78.2926 26.6456L74.7509 31.1384L71.8163 34.943L67.607 40.6097L64.9758 45.1431L65.2188 45.5072L65.8464 45.4466L75.358 43.4228L80.4984 42.4917L86.6304 41.4393L89.4033 42.7346L89.7065 44.0502L88.6135 46.7419L82.0566 48.3607L74.3662 49.8989L62.9118 52.6109L62.77 52.7121L62.9321 52.9144L68.0925 53.4L70.2987 53.5214H75.7021L85.7601 54.2702L88.3912 56.0108L89.9697 58.1358L89.7065 59.7545L85.6589 61.8189L80.1949 60.5236L67.4452 57.4881L63.0735 56.3952H62.4665V56.7596L66.1093 60.3213L72.7877 66.3523L81.1461 74.1236L81.5707 76.0462L80.4984 77.5638L79.3649 77.4021L72.0186 71.8772L69.1854 69.3879L62.77 63.9844H62.3453V64.5509L63.8223 66.7164L71.6342 78.4544L72.0389 82.0567L71.4725 83.2308L69.4487 83.939L67.2222 83.534L62.6485 77.1189L57.9333 69.8937L54.1284 63.4177L53.6631 63.6809L51.4167 87.8651L50.3644 89.0995L47.9356 90.0303L45.9121 88.4924L44.8392 86.0031L45.9118 81.0852L47.2071 74.6701L48.2594 69.5699L49.2106 63.2356L49.7773 61.131L49.7367 60.9892L49.2715 61.0498L44.4954 67.607L37.23 77.4224L31.4825 83.5746L30.1063 84.1211L27.7181 82.8864L27.9408 80.6805L29.2763 78.7177L37.2297 68.5988L42.026 62.3248L45.1227 58.7025L45.1024 58.176H44.9204L23.7917 71.8975L20.0274 72.3831L18.4083 70.8655L18.6106 68.3761L19.3798 67.5664L25.7343 63.195L25.7146 63.2153Z" fill="currentColor"/>
    </svg>
  )
}

function GeminiLogo() {
  return (
    <svg width="16" height="16" viewBox="0 0 192 192" fill="none">
      <path d="M96 8c3.6 0 6.8 2.4 7.7 5.9 5.4 21.2 19.2 35 40.4 40.4 3.5.9 5.9 4.1 5.9 7.7s-2.4 6.8-5.9 7.7c-21.2 5.4-35 19.2-40.4 40.4-.9 3.5-4.1 5.9-7.7 5.9s-6.8-2.4-7.7-5.9c-5.4-21.2-19.2-35-40.4-40.4C44.4 68.8 42 65.6 42 62s2.4-6.8 5.9-7.7c21.2-5.4 35-19.2 40.4-40.4C89.2 10.4 92.4 8 96 8z" fill="currentColor"/>
      <path d="M160 88c1.8 0 3.4 1.2 3.8 2.9 2.6 10.2 9.3 16.9 19.5 19.5 1.7.4 2.9 2 2.9 3.8s-1.2 3.4-2.9 3.8c-10.2 2.6-16.9 9.3-19.5 19.5-.4 1.7-2 2.9-3.8 2.9s-3.4-1.2-3.8-2.9c-2.6-10.2-9.3-16.9-19.5-19.5-1.7-.4-2.9-2-2.9-3.8s1.2-3.4 2.9-3.8c10.2-2.6 16.9-9.3 19.5-19.5.4-1.7 2-2.9 3.8-2.9z" fill="currentColor"/>
    </svg>
  )
}

function CodexLogo() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M22.282 9.821a5.985 5.985 0 00-.516-4.91 6.046 6.046 0 00-6.51-2.9A6.065 6.065 0 0011.05.17 6.018 6.018 0 004.28 4.16a5.975 5.975 0 00-3.993 2.9 6.046 6.046 0 00.743 7.097 5.98 5.98 0 00.51 4.911 6.051 6.051 0 006.515 2.9A5.985 5.985 0 0012.95 23.83a6.018 6.018 0 006.772-3.99 5.97 5.97 0 003.997-2.9 6.042 6.042 0 00-.737-7.119zM12.95 22.27a4.49 4.49 0 01-2.89-1.045l.147-.084 4.794-2.77a.78.78 0 00.395-.678v-6.76l2.027 1.17a.072.072 0 01.039.052v5.601a4.508 4.508 0 01-4.512 4.514zm-9.69-4.141a4.49 4.49 0 01-.54-3.015l.148.088 4.794 2.77a.78.78 0 00.788 0l5.853-3.38v2.34a.072.072 0 01-.029.062l-4.847 2.799a4.504 4.504 0 01-6.167-1.664zM2.103 7.871a4.491 4.491 0 012.35-1.97l-.003.168v5.539a.78.78 0 00.395.676l5.852 3.379-2.026 1.17a.072.072 0 01-.068.006L3.754 14.04A4.508 4.508 0 012.103 7.87zm16.646 3.881l-5.852-3.38 2.026-1.17a.072.072 0 01.068-.005l4.848 2.799a4.504 4.504 0 01-.696 8.137v-5.706a.78.78 0 00-.394-.675zm2.016-3.024l-.148-.088-4.794-2.77a.78.78 0 00-.788 0L9.182 9.25V6.91a.072.072 0 01.029-.062l4.847-2.798a4.504 4.504 0 016.707 4.678zM8.093 12.75l-2.027-1.17a.072.072 0 01-.039-.053V5.926a4.504 4.504 0 017.4-3.454l-.148.084-4.793 2.77a.78.78 0 00-.396.677l-.003 6.747zm1.1-2.373l2.607-1.505 2.607 1.505v3.01l-2.607 1.505-2.607-1.505V10.377z" fill="currentColor"/>
    </svg>
  )
}

const LOGO_MAP: Record<string, React.FC> = {
  claude: ClaudeLogo,
  codex: CodexLogo,
  gemini: GeminiLogo,
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
  if (pct >= 80) return "rgba(239,68,68,0.6)"
  if (pct >= 50) return "rgba(245,158,11,0.5)"
  return "rgba(52,199,89,0.4)"
}

const mono: React.CSSProperties = { fontFamily: "var(--font-geist-mono), monospace" }
const d = (a: number): string => `rgba(255,255,255,${a})`

/* ─── Component ─── */
export default function HomeView({
  connectionState, isProcessing, sessionsList, agentName,
  isMobile = false, resumeSession, onNewSession,
  model, provider, setConfig, contextPressure, activities,
}: HomeViewProps) {
  const { providers: usageProviders, isAvailable: usageAvailable } = useProviderUsage()

  const switchProvider = React.useCallback((def: ProviderDef) => {
    setConfig("model.default", def.model)
    setConfig("model.provider", def.provider)
  }, [setConfig])

  const isOffline = connectionState !== "connected"
  const statusDot = isOffline ? "#EF4444" : isProcessing ? "#5BA4F6" : "#34C759"
  const statusText = isOffline ? "Offline" : isProcessing ? "Processing" : "Connected"
  const activeModel = model.split("/").pop() || model

  const recentSessions = React.useMemo(() =>
    sessionsList
      .filter(s => s.id !== "home" && s.preview)
      .sort((a, b) => b.last_active - a.last_active)
      .slice(0, 4),
    [sessionsList]
  )

  const recentActivity = React.useMemo(() =>
    activities.filter(a => a.kind !== "status").slice(-5).reverse(),
    [activities]
  )

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
        gap: isMobile ? 14 : 18,
        position: "relative", maxWidth: 440, margin: "0 auto", width: "100%",
      }}>

        {/* ═══ Eye + Status ═══ */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <IrisEyeTracking
            size={isMobile ? 80 : 120}
            status={isOffline ? "error" : isProcessing ? "processing" : "idle"}
            connectionState={connectionState}
          />
          <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase" as const, color: d(0.2) }}>
              {agentName}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
              <span style={{
                width: 5, height: 5, borderRadius: "50%", background: statusDot,
                boxShadow: !isOffline ? `0 0 6px ${statusDot}` : "none",
              }} />
              <span style={{ fontSize: 10, color: d(0.4), fontWeight: 500 }}>{statusText}</span>
              <span style={{ fontSize: 9, color: d(0.12) }}>·</span>
              <span style={{ fontSize: 9, color: d(0.2), ...mono }}>{activeModel}</span>
            </div>
            {contextPressure > 0 && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 2 }}>
                <span style={{ fontSize: 8, color: d(0.12), textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>ctx</span>
                <div style={{ width: 60, height: 2, borderRadius: 1, background: d(0.04), overflow: "hidden" }}>
                  <div style={{
                    width: `${contextPressure}%`, height: "100%", borderRadius: 1,
                    background: contextPressure > 80 ? "rgba(239,68,68,0.5)" : d(0.15),
                  }} />
                </div>
                <span style={{ fontSize: 8, color: d(0.1), ...mono }}>{contextPressure}%</span>
              </div>
            )}
          </div>
        </div>

        {/* ═══ Providers — vertical list, no boxes ═══ */}
        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 0 }}>
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
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 6px",
                  background: "transparent", border: "none",
                  cursor: isActive ? "default" : "pointer",
                  borderRadius: 6,
                  transition: "background 100ms ease",
                  width: "100%",
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = d(0.02) }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent" }}
              >
                {/* Logo */}
                <span style={{
                  color: isActive ? d(0.7) : d(0.15),
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 20, flexShrink: 0,
                  transition: "color 150ms ease",
                }}>
                  {Logo && <Logo />}
                </span>

                {/* Name + active dot */}
                <span style={{
                  fontSize: 12, fontWeight: isActive ? 600 : 400,
                  color: isActive ? d(0.7) : d(0.25),
                  transition: "color 150ms ease",
                  minWidth: 80,
                  textAlign: "left" as const,
                }}>
                  {def.label}
                </span>

                {/* Usage bar + percentage — right side */}
                <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
                  {mainPct !== null ? (
                    <>
                      <div style={{ width: 80, height: 2, borderRadius: 1, background: d(0.04), overflow: "hidden" }}>
                        <div style={{
                          width: `${mainPct}%`, height: "100%", borderRadius: 1,
                          background: barColor(mainPct),
                          transition: "width 600ms ease",
                        }} />
                      </div>
                      <span style={{ fontSize: 10, color: d(0.3), ...mono, width: 28, textAlign: "right" as const }}>
                        {Math.round(mainPct)}%
                      </span>
                    </>
                  ) : (
                    <>
                      <div style={{ width: 80, height: 2, borderRadius: 1, background: d(0.02) }} />
                      <span style={{ fontSize: 10, color: d(0.08), ...mono, width: 28, textAlign: "right" as const }}>—</span>
                    </>
                  )}
                </div>

                {/* Active indicator */}
                {isActive && (
                  <span style={{
                    width: 4, height: 4, borderRadius: "50%",
                    background: "#34C759", flexShrink: 0,
                    boxShadow: "0 0 4px rgba(52,199,89,0.5)",
                  }} />
                )}
              </button>
            )
          })}
        </div>

        {/* ═══ Input ═══ */}
        <button
          onClick={onNewSession}
          style={{
            width: "100%", padding: "9px 14px", borderRadius: 8,
            border: `1px solid ${d(0.04)}`, background: d(0.015),
            color: d(0.18), fontSize: 12, textAlign: "left" as const,
            cursor: "pointer", transition: "border-color 150ms ease",
            display: "flex", alignItems: "center", gap: 8,
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = d(0.1) }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = d(0.04) }}
        >
          <span style={{ opacity: 0.3, fontSize: 12 }}>→</span>
          <span>Ask {agentName} anything...</span>
        </button>

        {/* ═══ Activity ═══ */}
        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{
            fontSize: 9, fontWeight: 600, textTransform: "uppercase" as const,
            letterSpacing: "0.08em", color: d(0.1),
          }}>
            Activity
          </div>

          {recentActivity.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {recentActivity.map(a => (
                <div key={a.id} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "3px 6px", borderRadius: 4,
                }}>
                  <span style={{
                    width: 4, height: 4, borderRadius: "50%", flexShrink: 0,
                    background: a.status === "running" ? d(0.4)
                      : a.status === "error" ? "rgba(239,68,68,0.4)"
                      : d(0.06),
                  }} />
                  <span style={{
                    fontSize: 11, color: a.status === "running" ? d(0.5) : d(0.25),
                    flex: 1, overflow: "hidden", textOverflow: "ellipsis",
                    whiteSpace: "nowrap" as const,
                  }}>
                    {a.title}
                  </span>
                  <span style={{ fontSize: 9, color: d(0.06), ...mono, flexShrink: 0 }}>
                    {a.timestamp}
                  </span>
                </div>
              ))}
            </div>
          )}

          {recentSessions.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 0, marginTop: 2 }}>
              {recentActivity.length > 0 && (
                <div style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.08em", color: d(0.08), marginBottom: 2 }}>
                  Sessions
                </div>
              )}
              {recentSessions.map(s => (
                <button
                  key={s.id}
                  onClick={() => resumeSession(s.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "3px 6px", borderRadius: 4, background: "transparent",
                    border: "none", cursor: "pointer", textAlign: "left" as const,
                    width: "100%", transition: "background 100ms ease",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = d(0.02) }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent" }}
                >
                  <span style={{ width: 4, height: 4, borderRadius: "50%", background: d(0.06), flexShrink: 0 }} />
                  <span style={{
                    fontSize: 11, color: d(0.25), flex: 1,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
                  }}>
                    {s.title || s.preview}
                  </span>
                  <span style={{ fontSize: 9, color: d(0.06), ...mono, flexShrink: 0 }}>
                    {relativeTime(s.last_active)}
                  </span>
                </button>
              ))}
            </div>
          )}

          {recentActivity.length === 0 && recentSessions.length === 0 && (
            <div style={{ padding: "8px 0", textAlign: "center" as const }}>
              <span style={{ fontSize: 11, color: d(0.08) }}>No activity yet</span>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
