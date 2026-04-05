"use client"

import * as React from "react"
import { Hash } from "lucide-react"
import { hapticLight } from "@/lib/haptics"
import { AgentIcon, type PantheonAgent } from "@/components/panels/pantheon-panel"

interface ChatHeaderProps {
  channelName: string
  channelColor: string
  sessionTitle: string
  contextPressure: number
  isMobile: boolean
  isDM?: boolean
  currentAgent?: PantheonAgent | null
  sidebarVisible: boolean
  pantheonVisible: boolean
  onToggleSidebar: () => void
  onTogglePantheon: () => void
  onOpenMobileSidebar: () => void
}

export function ChatHeader({
  channelName,
  channelColor,
  sessionTitle,
  contextPressure,
  isMobile,
  isDM,
  currentAgent,
  sidebarVisible,
  pantheonVisible,
  onToggleSidebar,
  onTogglePantheon,
  onOpenMobileSidebar,
}: ChatHeaderProps) {
  return (
    <header
      className="flex flex-col flex-shrink-0"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        borderBottom: "1px solid var(--color-border-dim)",
        // @ts-expect-error WebkitAppRegion is non-standard
        WebkitAppRegion: "drag",
      }}
    >
      <div style={{ height: 2 }} />
      <div className="flex items-center px-6" style={{ height: 52, gap: 12 }}>
        {/* Left: panel toggle + channel name */}
        <div className="flex items-center gap-3 flex-shrink-0" style={{
          // @ts-expect-error WebkitAppRegion is non-standard
          WebkitAppRegion: "no-drag",
        }}>
          {isMobile ? (
            <button
              aria-label="Open sidebar"
              onClick={() => { hapticLight(); onOpenMobileSidebar() }}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: 12,
                margin: -12,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 44,
                minHeight: 44,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M3 5h12M3 9h12M3 13h12" stroke="var(--color-text-secondary)" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          ) : (
            <button
              aria-label="Toggle sidebar"
              onClick={onToggleSidebar}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: 6,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: sidebarVisible ? "var(--color-text-tertiary)" : "var(--color-text-quaternary)",
                transition: "color 150ms ease",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="1" y="2" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.2" />
                <line x1="5.5" y1="2" x2="5.5" y2="14" stroke="currentColor" strokeWidth="1.2" />
              </svg>
            </button>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {isDM && currentAgent ? (
              <AgentIcon agent={currentAgent} size={8} />
            ) : (
              <Hash size={16} strokeWidth={2} style={{ color: channelColor, opacity: 0.7 }} />
            )}
            <span style={{ fontSize: 14, fontWeight: 600, color: isDM ? channelColor : "var(--color-text-primary)", letterSpacing: "-0.01em" }}>
              {channelName}
            </span>
          </div>
        </div>

        {/* Center: session title */}
        <div style={{
          flex: 1,
          minWidth: 0,
          fontSize: 13,
          fontWeight: 400,
          color: "var(--color-text-tertiary)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap" as const,
          pointerEvents: "none",
        }}>
          {sessionTitle}
        </div>

        {/* Right: context pressure + agents toggle */}
        <div className="flex items-center gap-3 flex-shrink-0" style={{
          // @ts-expect-error WebkitAppRegion is non-standard
          WebkitAppRegion: "no-drag",
        }}>
          {contextPressure > 0 && (
            <div className="flex items-center gap-2">
              <span style={{ fontFamily: "var(--font-geist-mono), monospace", fontSize: 10, color: "var(--color-text-quaternary)" }}>{contextPressure}%</span>
              <div style={{ width: 64, height: 3, borderRadius: 2, background: "var(--color-border-dim)", overflow: "hidden" }}>
                <div className="pressure-bar-fill" style={{ width: `${contextPressure}%`, height: "100%", borderRadius: 2, background: contextPressure > 80 ? "rgba(239,68,68,0.5)" : "var(--color-text-tertiary)" }} />
              </div>
            </div>
          )}
          {!isMobile && (
            <button
              aria-label="Toggle agents panel"
              onClick={onTogglePantheon}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: 6,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: pantheonVisible ? "var(--color-text-tertiary)" : "var(--color-text-quaternary)",
                transition: "color 150ms ease",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="1" y="2" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.2" />
                <line x1="10.5" y1="2" x2="10.5" y2="14" stroke="currentColor" strokeWidth="1.2" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
