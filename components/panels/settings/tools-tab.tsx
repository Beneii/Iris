"use client"

import * as React from "react"

export function ToolsTab({
  toolsetsData,
  requestToolsets,
}: {
  toolsetsData: { name: string; available: boolean; tools: string[]; requirements: string[] }[] | null
  requestToolsets: () => void
}) {
  const hasRequested = React.useRef(false)
  React.useEffect(() => {
    if (!hasRequested.current) {
      hasRequested.current = true
      requestToolsets()
    }
  }, [requestToolsets])

  if (!toolsetsData) {
    return (
      <div style={{ padding: 16, fontSize: 12, color: "var(--color-text-muted)" }}>
        Loading toolsets...
      </div>
    )
  }

  const available = toolsetsData.filter((t) => t.available)
  const unavailable = toolsetsData.filter((t) => !t.available)

  const sectionLabel: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 500,
    color: "var(--color-text-muted)",
    letterSpacing: "0.06em",
    textTransform: "uppercase" as const,
    marginBottom: 8,
  }

  return (
    <div style={{ padding: "4px 8px" }}>
      <div style={sectionLabel}>Available ({available.length})</div>
      {available.map((ts) => (
        <div key={ts.name} style={{ marginBottom: 8 }}>
          <div className="flex items-center gap-2" style={{ marginBottom: 2 }}>
            <span
              className="status-dot dot-success"
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: "#34C759",
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-secondary)" }}>
              {ts.name}
            </span>
            <span style={{ fontSize: 10, color: "var(--color-text-faint)" }}>
              {ts.tools.length}
            </span>
          </div>
          <div style={{ paddingLeft: 13, fontSize: 11, color: "var(--color-text-faint)" }}>
            {ts.tools.join(", ")}
          </div>
        </div>
      ))}

      {unavailable.length > 0 && (
        <>
          <div
            style={{
              ...sectionLabel,
              color: "var(--color-text-faint)",
              marginTop: 16,
            }}
          >
            Unavailable ({unavailable.length})
          </div>
          {unavailable.map((ts) => (
            <div key={ts.name} style={{ marginBottom: 6 }}>
              <div className="flex items-center gap-2">
                <span
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: "50%",
                    background: "var(--color-border-subtle)",
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 12, fontWeight: 400, color: "var(--color-text-muted)" }}>
                  {ts.name}
                </span>
              </div>
              {ts.requirements.length > 0 && (
                <div style={{ paddingLeft: 13, fontSize: 10, color: "rgba(239,68,68,0.4)" }}>
                  Requires configuration
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  )
}


/* ═══════════════════════════════════════════════
   Skills Tab (NEW)
   ═══════════════════════════════════════════════ */

const skillCategoryColor: Record<string, string> = {
  apple: "#5BA4F6",
  "autonomous-ai-agents": "var(--color-text-secondary)",
  creative: "#F65B8A",
  github: "var(--color-text-secondary)",
  research: "#5BF6C8",
  productivity: "#F6D55B",
  media: "#F65B8A",
  "software-development": "#5BA4F6",
}

function getSkillColor(category: string): string {
  return skillCategoryColor[category] ?? "var(--color-text-tertiary)"
}

function SkillsTab({
  skillsData,
  requestSkills,
}: {
  skillsData: { name: string; category: string; description: string; enabled: boolean }[] | null
  requestSkills: () => void
}) {
  const hasRequested = React.useRef(false)
  const [search, setSearch] = React.useState("")

  React.useEffect(() => {
    if (!hasRequested.current) {
      hasRequested.current = true
      requestSkills()
    }
  }, [requestSkills])

  if (!skillsData) {
    return (
      <div style={{ padding: 16, fontSize: 12, color: "var(--color-text-muted)" }}>
        Loading skills...
      </div>
    )
  }

  // Filter
  const filtered = search.trim()
    ? skillsData.filter(
        (s) =>
          s.name.toLowerCase().includes(search.toLowerCase()) ||
          s.category.toLowerCase().includes(search.toLowerCase()) ||
          s.description.toLowerCase().includes(search.toLowerCase())
      )
    : skillsData

  // Group by category
  const grouped: Record<string, typeof filtered> = {}
  for (const skill of filtered) {
    const cat = skill.category || "other"
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat].push(skill)
  }

  const categories = Object.keys(grouped).sort()

  return (
    <div style={{ padding: "4px 0" }}>
      {/* Search input */}
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Filter skills..."
        style={{
          width: "100%",
          fontSize: 12,
          color: "var(--color-text-secondary)",
          background: "var(--color-button-bg)",
          border: "1px solid var(--color-border-dim)",
          borderRadius: 6,
          padding: "8px 12px",
          outline: "none",
          fontFamily: "inherit",
          marginBottom: 16,
        }}
      />

      {filtered.length === 0 ? (
        <div style={{ padding: 24, textAlign: "center" as const }}>
          <span style={{ fontSize: 12, color: "var(--color-text-faint)" }}>
            No skills found
          </span>
        </div>
      ) : (
        categories.map((category) => {
          const skills = grouped[category]
          const color = getSkillColor(category)

          return (
            <div key={category} style={{ marginBottom: 16 }}>
              {/* Category header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: color,
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 500,
                    color: "var(--color-text-ghost)",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase" as const,
                  }}
                >
                  {category.replace(/-/g, " ")}
                </span>
                <span style={{ fontSize: 10, color: "var(--color-text-quaternary)", opacity: 0.8 }}>
                  {skills.length}
                </span>
              </div>

              {/* Skill cards */}
              <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingLeft: 14 }}>
                {skills.map((skill) => (
                  <div
                    key={skill.name}
                    style={{
                      padding: "8px 10px",
                      background: "var(--color-hover-bg)",
                      borderRadius: 6,
                      borderLeft: `2px solid ${color}`,
                      transition: "background 120ms ease",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: skill.description ? 2 : 0,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 500,
                          color: skill.enabled
                            ? "var(--color-text-secondary)"
                            : "var(--color-text-ghost)",
                        }}
                      >
                        {skill.name}
                      </span>
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 500,
                          color: skill.enabled ? "#34C759" : "var(--color-text-faint)",
                          textTransform: "uppercase" as const,
                          letterSpacing: "0.04em",
                        }}
                      >
                        {skill.enabled ? "ON" : "OFF"}
                      </span>
                    </div>
                    {skill.description && (
                      <p
                        style={{
                          fontSize: 11,
                          color: "var(--color-text-muted)",
                          margin: 0,
                          lineHeight: 1.4,
                        }}
                      >
                        {skill.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}

