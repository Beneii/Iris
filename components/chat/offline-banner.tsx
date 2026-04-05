"use client"

import { hapticLight } from "@/lib/haptics"

export function OfflineBanner({ onReconnect }: { onReconnect: () => void }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      padding: "8px 16px",
      background: "rgba(239,68,68,0.08)",
      borderBottom: "1px solid rgba(239,68,68,0.15)",
      flexShrink: 0,
    }}>
      <span style={{ fontSize: 12, color: "rgba(239,68,68,0.7)" }}>Connection lost</span>
      <button
        onClick={() => { hapticLight(); onReconnect() }}
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: "var(--color-text-secondary)",
          background: "var(--color-border-dim)",
          border: "1px solid var(--color-border-subtle)",
          borderRadius: 6,
          padding: "4px 12px",
          cursor: "pointer",
          minHeight: 28,
        }}
      >
        Retry
      </button>
    </div>
  )
}
