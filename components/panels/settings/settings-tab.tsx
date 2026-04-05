"use client"

import * as React from "react"
import { useTheme } from "@/hooks/use-theme"

type ProviderInfo = { id: string; name: string; configured: boolean; base_url: string; default_model: string; models: string[] }

export function SettingsTab({
  configData,
  requestConfig,
  setConfig,
  model,
  provider,
  agentName,
  providersData,
  requestProviders,
}: {
  configData: Record<string, unknown> | null
  requestConfig: () => void
  setConfig: (key: string, value: unknown) => void
  model: string
  provider: string
  agentName: string
  providersData: ProviderInfo[] | null
  requestProviders: () => void
}) {
  const hasRequested = React.useRef(false)
  const [editingKey, setEditingKey] = React.useState<string | null>(null)
  const [editValue, setEditValue] = React.useState("")

  React.useEffect(() => {
    if (!hasRequested.current) {
      hasRequested.current = true
      requestConfig()
      requestProviders()
    }
  }, [requestConfig, requestProviders])

  const handleStartEdit = (key: string, currentValue: string) => {
    setEditingKey(key)
    setEditValue(currentValue)
  }

  const handleSaveEdit = () => {
    if (editingKey) {
      setConfig(editingKey, editValue)
      setEditingKey(null)
    }
  }

  const getNestedValue = (obj: Record<string, unknown>, path: string): string => {
    const parts = path.split(".")
    let current: unknown = obj
    for (const part of parts) {
      if (current && typeof current === "object" && part in (current as Record<string, unknown>)) {
        current = (current as Record<string, unknown>)[part]
      } else {
        return ""
      }
    }
    return String(current ?? "")
  }

  const terminalBackend = configData ? getNestedValue(configData, "terminal.backend") : ""
  const approvalMode = configData ? getNestedValue(configData, "approvals.mode") : ""
  const maxTurns = configData ? getNestedValue(configData, "agent.max_turns") : ""

  // Split providers: configured first, then unconfigured
  const configuredProviders = React.useMemo(() =>
    providersData?.filter(p => p.configured) ?? [],
    [providersData]
  )
  const unconfiguredProviders = React.useMemo(() =>
    providersData?.filter(p => !p.configured) ?? [],
    [providersData]
  )

  const activeProvider = React.useMemo(() =>
    providersData?.find(p => p.id === provider) ?? null,
    [providersData, provider]
  )

  const handleProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const pid = e.target.value
    const p = providersData?.find(pr => pr.id === pid)
    if (p) {
      setConfig("model.provider", pid)
      if (p.base_url) setConfig("model.base_url", p.base_url)
      // Auto-switch to the provider's default model
      if (p.default_model) setConfig("model.default", p.default_model)
      setTimeout(() => requestConfig(), 500)
    }
  }

  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const m = e.target.value
    if (m === "__custom__") {
      handleStartEdit("model.default", model)
      return
    }
    setConfig("model.default", m)
    setTimeout(() => requestConfig(), 500)
  }

  const handleModelSave = () => {
    if (editingKey === "model.default") {
      setConfig("model.default", editValue)
      setEditingKey(null)
      setTimeout(() => requestConfig(), 500)
    }
  }

  if (!configData) {
    return (
      <div className="flex flex-col items-center justify-center py-16" style={{ gap: 12 }}>
        <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Loading config...</span>
      </div>
    )
  }

  const editableRow = (label: string, key: string, value: string) => (
    <div style={settingRowStyle}>
      <span style={labelStyle}>{label}</span>
      {editingKey === key ? (
        <input
          autoFocus
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSaveEdit()
            if (e.key === "Escape") setEditingKey(null)
          }}
          onBlur={() => setEditingKey(null)}
          style={inputStyle}
        />
      ) : (
        <span
          style={editableValueStyle}
          onClick={() => handleStartEdit(key, value)}
        >
          {value || "\u2014"}
          <span style={{ fontSize: 9, color: "var(--color-text-quaternary)", opacity: 0.8 }}>&#9998;</span>
        </span>
      )}
    </div>
  )

  return (
    <div>
      {/* ─── Model & Provider ─── */}
      <div style={sectionHeaderStyle}>Model</div>

      {/* Provider select */}
      <div style={settingRowStyle}>
        <span style={labelStyle}>Provider</span>
        <select
          value={provider}
          onChange={handleProviderChange}
          style={selectStyle}
        >
          {configuredProviders.length > 0 && (
            <optgroup label="Configured">
              {configuredProviders.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </optgroup>
          )}
          {unconfiguredProviders.length > 0 && (
            <optgroup label="Not configured">
              {unconfiguredProviders.map(p => (
                <option key={p.id} value={p.id}>{p.name} (no key)</option>
              ))}
            </optgroup>
          )}
          {!providersData && (
            <option value={provider}>{provider}</option>
          )}
        </select>
      </div>

      {/* Model select / custom input */}
      <div style={settingRowStyle}>
        <span style={labelStyle}>Model</span>
        {editingKey === "model.default" ? (
          <input
            autoFocus
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleModelSave()
              if (e.key === "Escape") setEditingKey(null)
            }}
            onBlur={() => { handleModelSave() }}
            style={{ ...inputStyle, width: 200 }}
            placeholder="model-name"
          />
        ) : activeProvider && activeProvider.models.length > 0 ? (
          <select
            value={activeProvider.models.includes(model) ? model : "__custom__"}
            onChange={handleModelChange}
            style={selectStyle}
          >
            {activeProvider.models.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
            {!activeProvider.models.includes(model) && (
              <option value="__custom__">{model} (custom)</option>
            )}
            <option value="__custom__">Custom...</option>
          </select>
        ) : (
          <span
            style={editableValueStyle}
            onClick={() => handleStartEdit("model.default", model)}
          >
            {model || "\u2014"}
            <span style={{ fontSize: 9, color: "var(--color-text-quaternary)", opacity: 0.8 }}>&#9998;</span>
          </span>
        )}
      </div>

      {/* Agent (read-only) */}
      <div style={settingRowStyle}>
        <span style={labelStyle}>Agent</span>
        <span style={{ ...valueStyle, display: "flex", alignItems: "center", gap: 4 }}>
          {agentName || "\u2014"}
        </span>
      </div>

      {/* ─── Agent Settings ─── */}
      <div style={sectionHeaderStyle}>Agent</div>
      {editableRow("Terminal", "terminal.backend", terminalBackend)}
      {editableRow("Approvals", "approvals.mode", approvalMode)}
      {editableRow("Max turns", "agent.max_turns", maxTurns)}

      {/* ─── Appearance ─── */}
      <AppearanceSection />
    </div>
  )
}

/* ─── Shared styles ─── */

const settingRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "8px 4px",
  borderBottom: "1px solid var(--color-hover-bg)",
}

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: "var(--color-text-tertiary)",
}

const valueStyle: React.CSSProperties = {
  fontSize: 12,
  color: "var(--color-text-secondary)",
  fontFamily: "var(--font-geist-mono), monospace",
  textAlign: "right" as const,
}

const editableValueStyle: React.CSSProperties = {
  ...valueStyle,
  cursor: "pointer",
  borderBottom: "1px dashed var(--color-border-subtle)",
  paddingBottom: 1,
  display: "flex",
  alignItems: "center",
  gap: 4,
}

const inputStyle: React.CSSProperties = {
  fontSize: 12,
  color: "var(--color-text-secondary)",
  fontFamily: "var(--font-geist-mono), monospace",
  background: "var(--color-button-bg)",
  border: "1px solid var(--color-border-subtle)",
  borderRadius: 4,
  padding: "2px 6px",
  outline: "none",
  textAlign: "right" as const,
  width: 120,
}

const selectStyle: React.CSSProperties = {
  fontSize: 12,
  color: "var(--color-text-secondary)",
  fontFamily: "var(--font-geist-mono), monospace",
  background: "var(--color-button-bg)",
  border: "1px solid var(--color-border-subtle)",
  borderRadius: 4,
  padding: "3px 6px",
  outline: "none",
  cursor: "pointer",
  maxWidth: 180,
}

const sectionHeaderStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "var(--color-text-muted)",
  padding: "16px 4px 8px",
}

function AppearanceSection() {
  const { theme, glass, toggleTheme, toggleGlass } = useTheme()

  const toggleStyle: React.CSSProperties = {
    width: 36,
    height: 20,
    borderRadius: 10,
    border: "none",
    cursor: "pointer",
    position: "relative",
    transition: "background 150ms ease",
    flexShrink: 0,
    padding: 0,
  }

  const dotStyle = (on: boolean): React.CSSProperties => ({
    width: 16,
    height: 16,
    borderRadius: "50%",
    background: "var(--color-text-primary)",
    position: "absolute",
    top: 2,
    left: on ? 18 : 2,
    transition: "left 150ms ease",
  })

  return (
    <>
      <div style={sectionHeaderStyle}>Appearance</div>
      <div style={settingRowStyle}>
        <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>Light mode</span>
        <button
          onClick={toggleTheme}
          style={{
            ...toggleStyle,
            background: theme === "light" ? "var(--color-status-success)" : "var(--color-border-subtle)",
          }}
        >
          <div style={dotStyle(theme === "light")} />
        </button>
      </div>
      <div style={settingRowStyle}>
        <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>Frosted glass panels</span>
        <button
          onClick={toggleGlass}
          style={{
            ...toggleStyle,
            background: glass ? "var(--color-status-success)" : "var(--color-border-subtle)",
          }}
        >
          <div style={dotStyle(glass)} />
        </button>
      </div>
    </>
  )
}
