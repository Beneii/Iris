"use client"

import * as React from "react"
import type { CronJob, JobOutput } from "@/hooks/use-hermes-bridge"

export function TasksTab({
  jobsList,
  jobOutputs,
  listJobs,
  createJob,
  pauseJob,
  resumeJob,
  triggerJob,
  removeJob,
  getJobOutput,
}: {
  jobsList: CronJob[]
  jobOutputs: Record<string, JobOutput[]>
  listJobs: () => void
  createJob: (data: { prompt: string; schedule: string; name?: string; repeat?: unknown; deliver?: string }) => void
  pauseJob: (id: string) => void
  resumeJob: (id: string) => void
  triggerJob: (id: string) => void
  removeJob: (id: string) => void
  getJobOutput: (id: string) => void
}) {
  const hasRequested = React.useRef(false)
  const [expandedJob, setExpandedJob] = React.useState<string | null>(null)
  const [showNewForm, setShowNewForm] = React.useState(false)
  const [newPrompt, setNewPrompt] = React.useState("")
  const [newSchedule, setNewSchedule] = React.useState("")
  const [newName, setNewName] = React.useState("")

  React.useEffect(() => {
    if (!hasRequested.current) {
      hasRequested.current = true
      listJobs()
    }
  }, [listJobs])

  const handleCreate = () => {
    if (!newPrompt.trim() || !newSchedule.trim()) return
    createJob({
      prompt: newPrompt.trim(),
      schedule: newSchedule.trim(),
      name: newName.trim() || undefined,
    })
    setNewPrompt("")
    setNewSchedule("")
    setNewName("")
    setShowNewForm(false)
  }

  const handleExpand = (jobId: string) => {
    if (expandedJob === jobId) {
      setExpandedJob(null)
    } else {
      setExpandedJob(jobId)
      getJobOutput(jobId)
    }
  }

  const jobStateColor = (state: string, lastStatus: string | null) => {
    if (lastStatus === "error") return "#EF4444"
    switch (state) {
      case "scheduled":
      case "running":
        return "var(--color-text-secondary)"
      case "paused":
        return "#F59E0B"
      case "completed":
        return "#34C759"
      default:
        return "var(--color-text-muted)"
    }
  }

  const formatTime = (ts: string | null) => {
    if (!ts) return "\u2014"
    try {
      const d = new Date(ts)
      return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    } catch {
      return ts
    }
  }

  const formInputStyle: React.CSSProperties = {
    fontSize: 12,
    color: "var(--color-text-secondary)",
    background: "var(--color-button-bg)",
    border: "1px solid var(--color-border-dim)",
    borderRadius: 4,
    padding: "6px 8px",
    outline: "none",
    fontFamily: "inherit",
  }

  return (
    <div style={{ padding: "4px 0" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 500,
            color: "var(--color-text-muted)",
            letterSpacing: "0.06em",
            textTransform: "uppercase" as const,
          }}
        >
          Scheduled Tasks ({jobsList.length})
        </span>
        <button
          onClick={() => setShowNewForm(!showNewForm)}
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: "var(--color-text-secondary)",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: "2px 0",
          }}
        >
          {showNewForm ? "Cancel" : "+ New Task"}
        </button>
      </div>

      {/* New task form */}
      {showNewForm && (
        <div
          style={{
            padding: 12,
            background: "var(--color-hover-bg)",
            borderRadius: 6,
            marginBottom: 12,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Name (optional)"
            style={formInputStyle}
          />
          <textarea
            value={newPrompt}
            onChange={(e) => setNewPrompt(e.target.value)}
            placeholder="Prompt \u2014 what should the agent do?"
            rows={3}
            style={{
              ...formInputStyle,
              resize: "vertical" as const,
              lineHeight: 1.5,
            }}
          />
          <div>
            <input
              value={newSchedule}
              onChange={(e) => setNewSchedule(e.target.value)}
              placeholder="Schedule: every 30m, 0 9 * * *, in 2h"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate()
              }}
              style={{
                ...formInputStyle,
                fontFamily: "var(--font-geist-mono), monospace",
                width: "100%",
              }}
            />
            <span
              style={{
                fontSize: 10,
                color: "var(--color-text-quaternary)",
                marginTop: 2,
                display: "block",
              }}
            >
              Examples: &quot;every 30m&quot;, &quot;0 9 * * *&quot;, &quot;in 2h&quot;
            </span>
          </div>
          <button
            onClick={handleCreate}
            disabled={!newPrompt.trim() || !newSchedule.trim()}
            style={{
              fontSize: 12,
              fontWeight: 500,
              color:
                newPrompt.trim() && newSchedule.trim()
                  ? "#fff"
                  : "var(--color-text-muted)",
              background:
                newPrompt.trim() && newSchedule.trim()
                  ? "var(--color-text-secondary)"
                  : "var(--color-button-bg)",
              border: "none",
              borderRadius: 4,
              padding: "6px 12px",
              cursor:
                newPrompt.trim() && newSchedule.trim() ? "pointer" : "default",
              alignSelf: "flex-end",
            }}
          >
            Create
          </button>
        </div>
      )}

      {/* Job list */}
      {jobsList.length === 0 ? (
        <div style={{ padding: 24, textAlign: "center" as const }}>
          <span style={{ fontSize: 12, color: "var(--color-text-faint)" }}>
            No scheduled tasks
          </span>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {jobsList.map((job) => {
            const isExpanded = expandedJob === job.id
            const dotColor = jobStateColor(job.state, job.last_status)
            const outputs = jobOutputs[job.id] || []

            return (
              <div key={job.id}>
                {/* Job row */}
                <button
                  onClick={() => handleExpand(job.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    width: "100%",
                    padding: "8px 4px",
                    background: isExpanded
                      ? "var(--color-hover-bg)"
                      : "transparent",
                    border: "none",
                    borderRadius: 6,
                    cursor: "pointer",
                    textAlign: "left" as const,
                    transition: "background 120ms ease",
                  }}
                  onMouseEnter={(e) => {
                    if (!isExpanded) e.currentTarget.style.background = "var(--color-hover-bg)"
                  }}
                  onMouseLeave={(e) => {
                    if (!isExpanded) e.currentTarget.style.background = "transparent"
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: dotColor,
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 500,
                        color: "var(--color-text-secondary)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap" as const,
                      }}
                    >
                      {job.name || job.prompt.slice(0, 40)}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: "var(--color-text-faint)",
                        fontFamily: "var(--font-geist-mono), monospace",
                      }}
                    >
                      {job.schedule_display}
                    </div>
                  </div>
                  <div style={{ flexShrink: 0, textAlign: "right" as const }}>
                    {job.last_run_at && (
                      <div style={{ fontSize: 10, color: "var(--color-text-faint)" }}>
                        {formatTime(job.last_run_at)}
                      </div>
                    )}
                    {job.last_status && (
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 500,
                          color: job.last_status === "ok" ? "#34C759" : "#EF4444",
                        }}
                      >
                        {job.last_status}
                      </span>
                    )}
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      color: "var(--color-text-quaternary)",
                      opacity: 0.85,
                      transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                      transition: "transform 200ms ease",
                      display: "inline-block",
                      flexShrink: 0,
                    }}
                  >
                    &#9662;
                  </span>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div
                    className="reasoning-content"
                    style={{
                      padding: "8px 4px 12px 18px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    {/* Prompt */}
                    <div>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 500,
                          color: "var(--color-text-faint)",
                          textTransform: "uppercase" as const,
                          letterSpacing: "0.05em",
                        }}
                      >
                        Prompt
                      </span>
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--color-text-tertiary)",
                          lineHeight: 1.5,
                          marginTop: 2,
                          maxHeight: 80,
                          overflow: "auto",
                        }}
                      >
                        {job.prompt}
                      </div>
                    </div>

                    {/* Info grid */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "4px 16px",
                      }}
                    >
                      <div>
                        <span style={{ fontSize: 10, color: "var(--color-text-quaternary)" }}>
                          Status
                        </span>
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--color-text-tertiary)",
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                            marginTop: 1,
                          }}
                        >
                          <span
                            style={{
                              width: 5,
                              height: 5,
                              borderRadius: "50%",
                              background: dotColor,
                              display: "inline-block",
                            }}
                          />
                          {job.state}
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: 10, color: "var(--color-text-quaternary)" }}>
                          Schedule
                        </span>
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--color-text-tertiary)",
                            fontFamily: "var(--font-geist-mono), monospace",
                            marginTop: 1,
                          }}
                        >
                          {job.schedule_display}
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: 10, color: "var(--color-text-quaternary)" }}>
                          Next run
                        </span>
                        <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 1 }}>
                          {formatTime(job.next_run_at)}
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: 10, color: "var(--color-text-quaternary)" }}>
                          Repeat
                        </span>
                        <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 1 }}>
                          {job.repeat.times != null
                            ? `${job.repeat.completed}/${job.repeat.times} completed`
                            : "Recurring"}
                        </div>
                      </div>
                    </div>

                    {/* Last error */}
                    {job.last_error && (
                      <div
                        style={{
                          fontSize: 11,
                          color: "rgba(239,68,68,0.6)",
                          background: "rgba(239,68,68,0.04)",
                          borderRadius: 4,
                          padding: "4px 8px",
                          borderLeft: "2px solid rgba(239,68,68,0.2)",
                        }}
                      >
                        {job.last_error}
                      </div>
                    )}

                    {/* Controls */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        paddingTop: 4,
                      }}
                    >
                      <button
                        onClick={() => triggerJob(job.id)}
                        style={{
                          fontSize: 11,
                          fontWeight: 500,
                          color: "var(--color-text-secondary)",
                          background: "transparent",
                          border: "none",
                          cursor: "pointer",
                          padding: 0,
                        }}
                      >
                        Trigger Now
                      </button>
                      {job.state === "paused" ? (
                        <button
                          onClick={() => resumeJob(job.id)}
                          style={{
                            fontSize: 11,
                            fontWeight: 500,
                            color: "#34C759",
                            background: "transparent",
                            border: "none",
                            cursor: "pointer",
                            padding: 0,
                          }}
                        >
                          Resume
                        </button>
                      ) : job.state !== "completed" ? (
                        <button
                          onClick={() => pauseJob(job.id)}
                          style={{
                            fontSize: 11,
                            fontWeight: 500,
                            color: "#F59E0B",
                            background: "transparent",
                            border: "none",
                            cursor: "pointer",
                            padding: 0,
                          }}
                        >
                          Pause
                        </button>
                      ) : null}
                      <button
                        onClick={() => {
                          removeJob(job.id)
                          setExpandedJob(null)
                        }}
                        style={{
                          fontSize: 11,
                          fontWeight: 500,
                          color: "rgba(239,68,68,0.5)",
                          background: "transparent",
                          border: "none",
                          cursor: "pointer",
                          padding: 0,
                        }}
                      >
                        Delete
                      </button>
                    </div>

                    {/* Output */}
                    {outputs.length > 0 && (
                      <div>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 500,
                            color: "var(--color-text-faint)",
                            textTransform: "uppercase" as const,
                            letterSpacing: "0.05em",
                          }}
                        >
                          Latest Output
                        </span>
                        <pre
                          style={{
                            fontSize: 11,
                            color: "var(--color-text-tertiary)",
                            fontFamily: "var(--font-geist-mono), monospace",
                            margin: "4px 0 0 0",
                            padding: "8px",
                            background: "var(--color-hover-bg)",
                            borderRadius: 4,
                            borderLeft: "2px solid var(--color-text-faint)",
                            overflow: "auto",
                            whiteSpace: "pre-wrap" as const,
                            maxHeight: 200,
                            lineHeight: 1.5,
                          }}
                        >
                          {outputs[0].content}
                        </pre>
                        {outputs.length > 1 && (
                          <span
                            style={{
                              fontSize: 10,
                              color: "var(--color-text-quaternary)",
                              opacity: 0.85,
                              marginTop: 2,
                              display: "block",
                            }}
                          >
                            + {outputs.length - 1} earlier run
                            {outputs.length > 2 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
