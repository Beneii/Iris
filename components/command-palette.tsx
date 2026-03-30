"use client"

import * as React from "react"
import { MessageSquare, Wrench, Sparkles, Cpu } from "lucide-react"

/* ─── Types ─── */

type ActionType = "send" | "ui"

export interface Command {
  name: string
  description: string
  category: string
  action: ActionType
}

interface CommandPaletteProps {
  query: string
  onSelect: (command: Command) => void
  onClose: () => void
  visible: boolean
}

/* ─── Command registry ─── */

const COMMANDS: Command[] = [
  // Conversation
  { name: "/new", description: "New session", category: "CONVERSATION", action: "ui" },
  { name: "/history", description: "Search past sessions", category: "CONVERSATION", action: "ui" },
  { name: "/memory", description: "View agent memory", category: "CONVERSATION", action: "ui" },

  // Tools
  { name: "/browse", description: "Open URL in browser", category: "TOOLS", action: "send" },
  { name: "/search", description: "Search project files", category: "TOOLS", action: "send" },
  { name: "/terminal", description: "Run shell command", category: "TOOLS", action: "send" },
  { name: "/vision", description: "Analyze image", category: "TOOLS", action: "send" },

  // Skills
  { name: "/skills", description: "Browse skill library", category: "SKILLS", action: "ui" },
  { name: "/plan", description: "Enter planning mode", category: "SKILLS", action: "send" },
  { name: "/review", description: "Code review mode", category: "SKILLS", action: "send" },
  { name: "/debug", description: "Systematic debugging", category: "SKILLS", action: "send" },

  // Automation
  { name: "/agents", description: "View subagents", category: "AUTOMATION", action: "ui" },
  { name: "/mcp", description: "MCP server status", category: "AUTOMATION", action: "ui" },
  { name: "/schedule", description: "Scheduled tasks", category: "AUTOMATION", action: "ui" },
]

const CATEGORY_META: Record<string, { symbol: string; icon: React.ElementType }> = {
  CONVERSATION: { symbol: "\u25C6", icon: MessageSquare },
  TOOLS: { symbol: "\u2699", icon: Wrench },
  SKILLS: { symbol: "\u2697", icon: Sparkles },
  AUTOMATION: { symbol: "\u25CE", icon: Cpu },
}

/* ─── Fuzzy match ─── */

function fuzzyMatch(text: string, pattern: string): boolean {
  if (!pattern) return true
  const lower = text.toLowerCase()
  const p = pattern.toLowerCase()
  let pi = 0
  for (let i = 0; i < lower.length && pi < p.length; i++) {
    if (lower[i] === p[i]) pi++
  }
  // Also allow simple substring match for better UX
  return pi === p.length || lower.includes(p)
}

/* ─── Component ─── */

export function CommandPalette({ query, onSelect, onClose, visible }: CommandPaletteProps) {
  const [selectedIndex, setSelectedIndex] = React.useState(0)
  const listRef = React.useRef<HTMLDivElement>(null)

  // Filter commands based on query
  const filtered = React.useMemo(() => {
    const q = query.startsWith("/") ? query.slice(1) : query
    return COMMANDS.filter(
      (cmd) =>
        fuzzyMatch(cmd.name, q) ||
        fuzzyMatch(cmd.description, q)
    )
  }, [query])

  // Group by category, preserving order
  const grouped = React.useMemo(() => {
    const map = new Map<string, Command[]>()
    for (const cmd of filtered) {
      const list = map.get(cmd.category) ?? []
      list.push(cmd)
      map.set(cmd.category, list)
    }
    return map
  }, [filtered])

  // Flat list for keyboard navigation
  const flatList = React.useMemo(() => {
    const result: Command[] = []
    for (const cmds of grouped.values()) {
      result.push(...cmds)
    }
    return result
  }, [grouped])

  // Reset selection when filter changes
  React.useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  // Scroll selected item into view
  React.useEffect(() => {
    if (!listRef.current) return
    const selected = listRef.current.querySelector("[data-selected='true']")
    if (selected) {
      selected.scrollIntoView({ block: "nearest" })
    }
  }, [selectedIndex])

  // Keyboard handler
  React.useEffect(() => {
    if (!visible) return

    function handleKeyDown(e: KeyboardEvent) {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault()
          setSelectedIndex((prev) => Math.min(prev + 1, flatList.length - 1))
          break
        case "ArrowUp":
          e.preventDefault()
          setSelectedIndex((prev) => Math.max(prev - 1, 0))
          break
        case "Enter":
          e.preventDefault()
          if (flatList[selectedIndex]) {
            onSelect(flatList[selectedIndex])
          }
          break
        case "Escape":
          e.preventDefault()
          onClose()
          break
        case "Tab":
          e.preventDefault()
          if (e.shiftKey) {
            setSelectedIndex((prev) => Math.max(prev - 1, 0))
          } else {
            setSelectedIndex((prev) => Math.min(prev + 1, flatList.length - 1))
          }
          break
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [visible, flatList, selectedIndex, onSelect, onClose])

  if (!visible || flatList.length === 0) return null

  let flatIndex = 0

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
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow:
            "0 -4px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)",
          maxHeight: 340,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "10px 14px 8px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: "rgba(255,255,255,0.3)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Commands
          </span>
          <span
            style={{
              fontSize: 10,
              color: "rgba(255,255,255,0.15)",
              marginLeft: "auto",
              fontFamily: "var(--font-mono, monospace)",
            }}
          >
            {flatList.length} result{flatList.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Scrollable list */}
        <div
          ref={listRef}
          style={{
            overflowY: "auto",
            padding: "4px 0",
            flex: 1,
          }}
        >
          {Array.from(grouped.entries()).map(([category, cmds]) => {
            const meta = CATEGORY_META[category]
            const Icon = meta?.icon ?? MessageSquare

            return (
              <div key={category}>
                {/* Category header */}
                <div
                  style={{
                    padding: "8px 14px 4px",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <Icon
                    size={12}
                    style={{ color: "rgba(255,255,255,0.25)", flexShrink: 0 }}
                  />
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: "rgba(255,255,255,0.3)",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    {meta?.symbol} {category}
                  </span>
                </div>

                {/* Commands */}
                {cmds.map((cmd) => {
                  const idx = flatIndex++
                  const isSelected = idx === selectedIndex

                  return (
                    <button
                      key={cmd.name}
                      data-selected={isSelected}
                      onClick={() => onSelect(cmd)}
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
                        background: isSelected
                          ? "rgba(255,255,255,0.12)"
                          : "transparent",
                        transition: "background 80ms ease",
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "var(--font-mono, monospace)",
                          fontSize: 13,
                          fontWeight: 500,
                          color: isSelected
                            ? "rgba(255,255,255,0.7)"
                            : "rgba(255,255,255,0.88)",
                          minWidth: 90,
                          flexShrink: 0,
                        }}
                      >
                        {cmd.name}
                      </span>
                      <span
                        style={{
                          fontSize: 12,
                          color: isSelected
                            ? "rgba(255,255,255,0.7)"
                            : "rgba(255,255,255,0.55)",
                          flex: 1,
                        }}
                      >
                        {cmd.description}
                      </span>
                      {cmd.action === "send" && (
                        <span
                          style={{
                            fontSize: 9,
                            color: "rgba(255,255,255,0.2)",
                            fontFamily: "var(--font-mono, monospace)",
                            padding: "1px 5px",
                            border: "1px solid rgba(255,255,255,0.06)",
                            borderRadius: 4,
                            flexShrink: 0,
                          }}
                        >
                          send
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>

        {/* Footer hint */}
        <div
          style={{
            padding: "6px 14px",
            borderTop: "1px solid rgba(255,255,255,0.06)",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span style={hintStyle}>
            <Kbd>↑↓</Kbd> navigate
          </span>
          <span style={hintStyle}>
            <Kbd>↵</Kbd> select
          </span>
          <span style={hintStyle}>
            <Kbd>esc</Kbd> close
          </span>
        </div>
      </div>
    </div>
  )
}

/* ─── Hint styles ─── */

const hintStyle: React.CSSProperties = {
  fontSize: 10,
  color: "rgba(255,255,255,0.2)",
  display: "flex",
  alignItems: "center",
  gap: 4,
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontFamily: "var(--font-mono, monospace)",
        fontSize: 9,
        padding: "1px 4px",
        borderRadius: 3,
        background: "rgba(255,255,255,0.06)",
        color: "rgba(255,255,255,0.3)",
      }}
    >
      {children}
    </span>
  )
}

export default CommandPalette
