"use client"

import * as React from "react"

const PERMISSION_LABELS: Record<string, string> = {
  filesystem: "Filesystem access",
  network: "Network access",
  commands: "Shell commands",
  memory: "Memory writes",
  tools: "Tool execution",
}

const PERMISSION_OPTIONS = ["allowed", "ask", "denied"] as const
type PermissionOption = (typeof PERMISSION_OPTIONS)[number]

export function PermissionsTab({
  permissionsData,
  requestPermissions,
  setPermission,
}: {
  permissionsData: Record<string, string> | null
  requestPermissions: () => void
  setPermission: (category: string, value: string) => void
}) {
  const hasRequested = React.useRef(false)
  React.useEffect(() => {
    if (!hasRequested.current) {
      hasRequested.current = true
      requestPermissions()
    }
  }, [requestPermissions])

  if (!permissionsData) {
    return (
      <div style={{ padding: 16, fontSize: 12, color: "var(--color-text-muted)" }}>
        Loading permissions...
      </div>
    )
  }

  const dotColor = (opt: PermissionOption) => {
    if (opt === "allowed") return "#34C759"
    if (opt === "ask") return "#F59E0B"
    return "#EF4444"
  }

  return (
    <div style={{ padding: "4px 0", display: "flex", flexDirection: "column", gap: 2 }}>
      {Object.keys(PERMISSION_LABELS).map((category) => {
        const current = permissionsData[category] || "allowed"
        return (
          <div
            key={category}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 4px",
              borderBottom: "1px solid var(--color-hover-bg)",
            }}
          >
            <span style={{ fontSize: 12, color: "var(--color-text-secondary)", fontWeight: 500 }}>
              {PERMISSION_LABELS[category]}
            </span>
            <div style={{ display: "flex", gap: 0, borderRadius: 6, overflow: "hidden", border: "1px solid var(--color-border-dim)" }}>
              {PERMISSION_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  onClick={() => setPermission(category, opt)}
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    color: current === opt ? "var(--color-text-primary)" : "var(--color-text-ghost)",
                    background: current === opt ? "var(--color-border-dim)" : "transparent",
                    border: "none",
                    cursor: "pointer",
                    padding: "4px 10px",
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    transition: "all 120ms ease",
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: current === opt ? dotColor(opt) : "var(--color-border-subtle)",
                      flexShrink: 0,
                    }}
                  />
                  {opt.charAt(0).toUpperCase() + opt.slice(1)}
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
