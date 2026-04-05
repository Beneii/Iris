"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight, Plus, Play, Pause, Trash2 } from "lucide-react"
import type { CronJob } from "@/types/hermes"
import { AGENT_COLORS } from "@/lib/markdown-components"

interface CalendarPanelProps {
  jobs: CronJob[]
  onCreateJob: (data: { prompt: string; schedule: string; name?: string; agent_id?: string }) => void
  onPauseJob: (id: string) => void
  onResumeJob: (id: string) => void
  onTriggerJob: (id: string) => void
  onRemoveJob: (id: string) => void
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay()
}

function parseJobDate(job: CronJob): Date | null {
  const ts = job.next_run_at || job.last_run_at
  if (!ts) return null
  const d = new Date(ts)
  return isNaN(d.getTime()) ? null : d
}

export function CalendarPanel({
  jobs,
  onCreateJob,
  onPauseJob,
  onResumeJob,
  onTriggerJob,
  onRemoveJob,
}: CalendarPanelProps) {
  const now = new Date()
  const [year, setYear] = React.useState(now.getFullYear())
  const [month, setMonth] = React.useState(now.getMonth())
  const [selectedDay, setSelectedDay] = React.useState<number | null>(null)
  const [showCreate, setShowCreate] = React.useState(false)

  const daysInMonth = getDaysInMonth(year, month)
  const firstDay = getFirstDayOfMonth(year, month)

  // Map jobs to days
  const jobsByDay = React.useMemo(() => {
    const map: Record<number, CronJob[]> = {}
    for (const job of jobs) {
      const d = parseJobDate(job)
      if (d && d.getFullYear() === year && d.getMonth() === month) {
        const day = d.getDate()
        if (!map[day]) map[day] = []
        map[day].push(job)
      }
    }
    return map
  }, [jobs, year, month])

  const selectedJobs = selectedDay ? (jobsByDay[selectedDay] || []) : []

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1) }
    else setMonth(m => m - 1)
    setSelectedDay(null)
  }

  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1) }
    else setMonth(m => m + 1)
    setSelectedDay(null)
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Month header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button onClick={prevMonth} style={navBtn}><ChevronLeft size={14} /></button>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary)" }}>
          {MONTHS[month]} {year}
        </span>
        <button onClick={nextMonth} style={navBtn}><ChevronRight size={14} /></button>
      </div>

      {/* Day headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1 }}>
        {DAYS.map(d => (
          <div key={d} style={{ fontSize: 9, fontWeight: 600, color: "var(--color-text-quaternary)", textAlign: "center", padding: "2px 0", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1 }}>
        {/* Empty cells for offset */}
        {Array.from({ length: firstDay }).map((_, i) => (
          <div key={`empty-${i}`} style={{ height: 32 }} />
        ))}
        {/* Day cells */}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1
          const isToday = day === now.getDate() && month === now.getMonth() && year === now.getFullYear()
          const isSelected = day === selectedDay
          const dayJobs = jobsByDay[day] || []
          return (
            <button
              key={day}
              onClick={() => setSelectedDay(day === selectedDay ? null : day)}
              style={{
                height: 32,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
                borderRadius: 6,
                border: "none",
                cursor: "pointer",
                background: isSelected ? "var(--color-active-bg)" : "transparent",
                position: "relative",
              }}
            >
              <span style={{
                fontSize: 11,
                fontWeight: isToday ? 700 : 400,
                color: isToday ? "var(--color-iris-blue)" : "var(--color-text-secondary)",
              }}>
                {day}
              </span>
              {dayJobs.length > 0 && (
                <div style={{ display: "flex", gap: 1 }}>
                  {dayJobs.slice(0, 3).map((j, ji) => (
                    <span key={ji} style={{
                      width: 3, height: 3, borderRadius: "50%",
                      background: AGENT_COLORS[(j as Record<string, unknown>).agent_id as string] || "var(--color-text-tertiary)",
                    }} />
                  ))}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Selected day jobs */}
      {selectedDay && (
        <div style={{ borderTop: "1px solid var(--color-border-dim)", paddingTop: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-tertiary)" }}>
              {MONTHS[month]} {selectedDay}
            </span>
            <button onClick={() => setShowCreate(true)} style={navBtn}><Plus size={12} /></button>
          </div>
          {selectedJobs.length === 0 && (
            <span style={{ fontSize: 11, color: "var(--color-text-quaternary)" }}>No jobs scheduled</span>
          )}
          {selectedJobs.map(job => (
            <JobRow key={job.id} job={job} onPause={onPauseJob} onResume={onResumeJob} onTrigger={onTriggerJob} onRemove={onRemoveJob} />
          ))}
        </div>
      )}

      {/* All jobs list (when no day selected) */}
      {!selectedDay && (
        <div style={{ borderTop: "1px solid var(--color-border-dim)", paddingTop: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-tertiary)" }}>
              All Jobs ({jobs.length})
            </span>
            <button onClick={() => setShowCreate(true)} style={navBtn}><Plus size={12} /></button>
          </div>
          {jobs.map(job => (
            <JobRow key={job.id} job={job} onPause={onPauseJob} onResume={onResumeJob} onTrigger={onTriggerJob} onRemove={onRemoveJob} />
          ))}
        </div>
      )}

      {/* Create job inline */}
      {showCreate && (
        <CreateJobForm
          onSubmit={(data) => { onCreateJob(data); setShowCreate(false) }}
          onCancel={() => setShowCreate(false)}
        />
      )}
    </div>
  )
}

function JobRow({ job, onPause, onResume, onTrigger, onRemove }: {
  job: CronJob
  onPause: (id: string) => void
  onResume: (id: string) => void
  onTrigger: (id: string) => void
  onRemove: (id: string) => void
}) {
  const isPaused = job.state === "paused"
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6, padding: "4px 0",
      borderBottom: "1px solid var(--color-hover-bg)",
    }}>
      <span style={{
        width: 4, height: 4, borderRadius: "50%", flexShrink: 0,
        background: isPaused ? "var(--color-status-warning)" : "var(--color-status-success)",
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {job.name || job.prompt.slice(0, 40)}
        </div>
        <div style={{ fontSize: 9, color: "var(--color-text-quaternary)", fontFamily: "var(--font-geist-mono)" }}>
          {job.schedule_display}
        </div>
      </div>
      <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
        <button onClick={() => onTrigger(job.id)} style={iconBtn} title="Run now"><Play size={10} /></button>
        {isPaused
          ? <button onClick={() => onResume(job.id)} style={iconBtn} title="Resume"><Play size={10} /></button>
          : <button onClick={() => onPause(job.id)} style={iconBtn} title="Pause"><Pause size={10} /></button>
        }
        <button onClick={() => onRemove(job.id)} style={{ ...iconBtn, color: "var(--color-status-error)" }} title="Delete"><Trash2 size={10} /></button>
      </div>
    </div>
  )
}

function CreateJobForm({ onSubmit, onCancel }: {
  onSubmit: (data: { prompt: string; schedule: string; name?: string; agent_id?: string }) => void
  onCancel: () => void
}) {
  const [name, setName] = React.useState("")
  const [prompt, setPrompt] = React.useState("")
  const [schedule, setSchedule] = React.useState("")
  const [agentId, setAgentId] = React.useState("hermes")

  return (
    <div style={{ padding: 8, background: "var(--color-hover-bg)", borderRadius: 8, display: "flex", flexDirection: "column", gap: 6 }}>
      <input placeholder="Job name" value={name} onChange={e => setName(e.target.value)} style={inputStyle} />
      <textarea placeholder="Prompt..." value={prompt} onChange={e => setPrompt(e.target.value)} rows={2} style={{ ...inputStyle, resize: "vertical" }} />
      <input placeholder="Schedule (e.g. every 30m, 0 9 * * *)" value={schedule} onChange={e => setSchedule(e.target.value)} style={inputStyle} />
      <select value={agentId} onChange={e => setAgentId(e.target.value)} style={inputStyle}>
        <option value="hermes">Hermes</option>
        <option value="talos">Talos</option>
        <option value="icarus">Icarus</option>
        <option value="charon">Charon</option>
        <option value="nyx">Nyx</option>
      </select>
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <button onClick={onCancel} style={{ ...iconBtn, padding: "4px 10px", fontSize: 11 }}>Cancel</button>
        <button
          onClick={() => { if (prompt && schedule) onSubmit({ prompt, schedule, name: name || undefined, agent_id: agentId }) }}
          style={{ ...iconBtn, padding: "4px 10px", fontSize: 11, background: "var(--color-active-bg)", color: "var(--color-text-primary)" }}
        >
          Create
        </button>
      </div>
    </div>
  )
}

const navBtn: React.CSSProperties = {
  background: "transparent", border: "none", cursor: "pointer",
  color: "var(--color-text-tertiary)", padding: 4, borderRadius: 4,
  display: "flex", alignItems: "center",
}

const iconBtn: React.CSSProperties = {
  background: "transparent", border: "none", cursor: "pointer",
  color: "var(--color-text-tertiary)", padding: 2, borderRadius: 3,
  display: "flex", alignItems: "center",
}

const inputStyle: React.CSSProperties = {
  fontSize: 12, color: "var(--color-text-secondary)",
  fontFamily: "var(--font-geist-mono), monospace",
  background: "var(--color-button-bg)", border: "1px solid var(--color-border-subtle)",
  borderRadius: 4, padding: "4px 6px", outline: "none", width: "100%",
}
