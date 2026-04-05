"use client"

import * as React from "react"
import { Hash } from "lucide-react"
import type { PantheonAgent } from "@/components/panels/pantheon-panel"
import { IrisLogo } from "@/components/iris-logo"

interface EmptyStateProps {
  currentAgent?: PantheonAgent
  isArchiveChannel: boolean
}

export function EmptyState({ currentAgent, isArchiveChannel }: EmptyStateProps) {
  const showAgentBadge = currentAgent && currentAgent.id !== "hermes"

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
        gap: 20,
      }}
    >
      {showAgentBadge ? (
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            background: `${currentAgent!.color}15`,
            border: `1px solid ${currentAgent!.color}30`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: currentAgent!.color,
            fontSize: 24,
            fontWeight: 600,
            fontFamily: "var(--font-geist-mono), monospace",
          }}
        >
          {currentAgent!.name.charAt(0)}
        </div>
      ) : isArchiveChannel ? (
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            background: "var(--color-hover-bg)",
            border: "1px solid var(--color-border-dim)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--color-text-muted)",
          }}
        >
          <Hash size={24} />
        </div>
      ) : (
        <div style={{ opacity: 0.15 }}>
          <IrisLogo size={48} />
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 400, color: "var(--color-text-tertiary)", textAlign: "center", maxWidth: 320, lineHeight: 1.5 }}>
          Inspect code, debug issues, run commands, or ask anything.
        </span>
        <span style={{ fontSize: 12, color: "var(--color-text-quaternary)" }}>
          Type <span style={{ color: "var(--color-iris-purple)", fontFamily: "var(--font-geist-mono), monospace" }}>/</span> to see available commands
        </span>
      </div>
    </div>
  )
}
