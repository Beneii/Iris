"use client"

import * as React from "react"
import { AGENT_COLORS } from "@/lib/markdown-components"

/* ─── Agent definitions ─── */
interface AgentOption {
  id: string
  name: string
  role: string
}

const AGENTS: AgentOption[] = [
  { id: "hermes", name: "Hermes", role: "Orchestrator" },
  { id: "talos", name: "Talos", role: "Builder" },
  { id: "icarus", name: "Icarus", role: "Experimental" },
  { id: "charon", name: "Charon", role: "Research" },
  { id: "nyx", name: "Nyx", role: "Daemon" },
]

interface MentionPickerProps {
  query: string
  visible: boolean
  onSelect: (agent: AgentOption) => void
  onClose: () => void
}

export function MentionPicker({ query, visible, onSelect, onClose }: MentionPickerProps) {
  const [selectedIndex, setSelectedIndex] = React.useState(0)
  const listRef = React.useRef<HTMLDivElement>(null)

  const filtered = React.useMemo(() => {
    const q = query.toLowerCase()
    if (!q) return AGENTS
    return AGENTS.filter(
      (a) => a.name.toLowerCase().includes(q) || a.role.toLowerCase().includes(q)
    )
  }, [query])

  React.useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  React.useEffect(() => {
    if (!listRef.current) return
    const selected = listRef.current.querySelector("[data-selected='true']")
    if (selected) selected.scrollIntoView({ block: "nearest" })
  }, [selectedIndex])

  React.useEffect(() => {
    if (!visible) return

    function handleKeyDown(e: KeyboardEvent) {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault()
          setSelectedIndex((prev) => Math.min(prev + 1, filtered.length - 1))
          break
        case "ArrowUp":
          e.preventDefault()
          setSelectedIndex((prev) => Math.max(prev - 1, 0))
          break
        case "Enter":
          e.preventDefault()
          if (filtered[selectedIndex]) onSelect(filtered[selectedIndex])
          break
        case "Tab":
          e.preventDefault()
          if (filtered[selectedIndex]) onSelect(filtered[selectedIndex])
          break
        case "Escape":
          e.preventDefault()
          onClose()
          break
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [visible, filtered, selectedIndex, onSelect, onClose])

  if (!visible || filtered.length === 0) return null

  return (
    <div
      style={{
        position: "absolute",
        bottom: "100%",
        left: 0,
        right: 0,
        marginBottom: 8,
        zIndex: 50,
      }}
    >
      <div
        className="palette-enter"
        style={{
          background: "#1A1A1F",
          borderRadius: 12,
          border: "1px solid var(--color-border-subtle)",
          boxShadow: "0 -4px 32px rgba(0,0,0,0.5), 0 0 0 1px var(--color-button-bg)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "10px 14px 8px",
            borderBottom: "1px solid var(--color-border-dim)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Mention Agent
          </span>
          <span style={{ fontSize: 10, color: "var(--color-text-faint)", marginLeft: "auto", fontFamily: "var(--font-mono, monospace)" }}>
            {filtered.length} agent{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Agent list */}
        <div ref={listRef} style={{ overflowY: "auto", padding: "4px 0" }}>
          {filtered.map((agent, idx) => {
            const isSelected = idx === selectedIndex
            const color = AGENT_COLORS[agent.id] || "var(--color-text-secondary)"

            return (
              <button
                key={agent.id}
                data-selected={isSelected}
                onClick={() => onSelect(agent)}
                onMouseEnter={() => setSelectedIndex(idx)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  padding: "7px 14px",
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left",
                  background: isSelected ? "var(--color-text-quaternary)" : "transparent",
                  transition: "background 80ms ease",
                }}
              >
                {/* Color dot */}
                <span style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: color,
                  flexShrink: 0,
                }} />
                {/* Name */}
                <span style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color,
                  minWidth: 70,
                  flexShrink: 0,
                }}>
                  @{agent.name.toLowerCase()}
                </span>
                {/* Role */}
                <span style={{
                  fontSize: 12,
                  color: "var(--color-text-secondary)",
                  flex: 1,
                }}>
                  {agent.role}
                </span>
              </button>
            )
          })}
        </div>

        {/* Footer */}
        <div style={{
          padding: "6px 14px",
          borderTop: "1px solid var(--color-border-dim)",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}>
          <span style={hintStyle}><Kbd>↑↓</Kbd> navigate</span>
          <span style={hintStyle}><Kbd>↵</Kbd> select</span>
          <span style={hintStyle}><Kbd>esc</Kbd> close</span>
        </div>
      </div>
    </div>
  )
}

const hintStyle: React.CSSProperties = {
  fontSize: 10,
  color: "var(--color-text-muted)",
  display: "flex",
  alignItems: "center",
  gap: 4,
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontFamily: "var(--font-mono, monospace)",
      fontSize: 9,
      padding: "1px 4px",
      borderRadius: 3,
      background: "var(--color-border-dim)",
      color: "var(--color-text-tertiary)",
    }}>
      {children}
    </span>
  )
}
