"use client"

import * as React from "react"

export function MemoryTab({
  memoryData,
  requestMemory,
}: {
  memoryData: { memory: string; user: string } | null
  requestMemory: () => void
}) {
  const hasRequested = React.useRef(false)
  React.useEffect(() => {
    if (!hasRequested.current) {
      hasRequested.current = true
      requestMemory()
    }
  }, [requestMemory])

  if (!memoryData) {
    return (
      <div className="flex flex-col items-center justify-center py-16" style={{ gap: 12 }}>
        <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Loading memory...</span>
      </div>
    )
  }

  const sectionHeaderStyle: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 500,
    letterSpacing: "0.08em",
    color: "var(--color-text-tertiary)",
    textTransform: "uppercase" as const,
    display: "block",
    marginBottom: 8,
    paddingLeft: 4,
  }

  const sectionContentStyle: React.CSSProperties = {
    fontSize: 12,
    color: "var(--color-text-tertiary)",
    lineHeight: 1.6,
    whiteSpace: "pre-wrap" as const,
    padding: "8px",
    background: "var(--color-hover-bg)",
    borderRadius: 6,
    maxHeight: 300,
    overflowY: "auto" as const,
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <span style={sectionHeaderStyle}>AGENT MEMORY</span>
        <div style={sectionContentStyle}>
          {memoryData.memory
            ? memoryData.memory.replace(/\u00A7/g, "").trim()
            : "No memory data"}
        </div>
      </div>
      <div>
        <span style={sectionHeaderStyle}>USER PROFILE</span>
        <div style={sectionContentStyle}>
          {memoryData.user
            ? memoryData.user.replace(/\u00A7/g, "").trim()
            : "No user profile"}
        </div>
      </div>
    </div>
  )
}


