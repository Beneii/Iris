"use client"

import * as React from "react"
import { X } from "lucide-react"
import type { CronJob, JobOutput } from "@/hooks/use-hermes-bridge"
import type { Project } from "@/types/hermes"
import { SettingsTab } from "@/components/panels/settings/settings-tab"
import { MemoryTab } from "@/components/panels/settings/memory-tab"
import { ToolsTab } from "@/components/panels/settings/tools-tab"
import { PermissionsTab } from "@/components/panels/settings/permissions-tab"
import { TasksTab } from "@/components/panels/settings/tasks-tab"
import { CalendarPanel } from "@/components/panels/calendar-panel"
import { ProjectsPanel } from "@/components/panels/projects-panel"

/* ─── Props ─── */
interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  activeTab: string
  onTabChange: (tab: string) => void
  // Settings tab
  configData: Record<string, unknown> | null
  requestConfig: () => void
  setConfig: (key: string, value: unknown) => void
  model: string
  provider: string
  agentName: string
  // Providers
  providersData: { id: string; name: string; configured: boolean; base_url: string; default_model: string; models: string[] }[] | null
  requestProviders: () => void
  // Memory tab
  memoryData: { memory: string; user: string } | null
  requestMemory: () => void
  // Tools tab
  toolsetsData: { name: string; available: boolean; tools: string[]; requirements: string[] }[] | null
  requestToolsets: () => void
  // Skills tab
  skillsData: { name: string; category: string; description: string; enabled: boolean }[] | null
  requestSkills: () => void
  // Permissions tab
  permissionsData: Record<string, string> | null
  requestPermissions: () => void
  setPermission: (category: string, value: string) => void
  // Tasks tab
  jobsList: CronJob[]
  jobOutputs: Record<string, JobOutput[]>
  listJobs: () => void
  createJob: (data: { prompt: string; schedule: string; name?: string; repeat?: unknown; deliver?: string }) => void
  pauseJob: (id: string) => void
  resumeJob: (id: string) => void
  triggerJob: (id: string) => void
  removeJob: (id: string) => void
  getJobOutput: (id: string) => void
  // Projects
  projectsList: { id: string; name: string; description: string; created_at: number; updated_at: number; session_ids: string[]; agent_ids: string[]; tags: string[]; status: string }[]
  activeSessionId: string
  onCreateProject: (data: { name: string; description?: string; agents?: string[] }) => void
  onUpdateProject: (projectId: string, data: Record<string, unknown>) => void
  onDeleteProject: (projectId: string) => void
  onLinkSession: (projectId: string, sessionId: string) => void
  onUnlinkSession: (projectId: string, sessionId: string) => void
  requestProjects: () => void
}

/* ─── Tabs ─── */
const TABS = ["settings", "memory", "tools", "permissions", "tasks", "calendar", "projects"] as const

/* ─── Main Component ─── */
export default function SettingsModal({
  isOpen,
  onClose,
  activeTab,
  onTabChange,
  configData,
  requestConfig,
  setConfig,
  model,
  provider,
  agentName,
  providersData,
  requestProviders,
  memoryData,
  requestMemory,
  toolsetsData,
  requestToolsets,
  skillsData,
  requestSkills,
  permissionsData,
  requestPermissions,
  setPermission,
  jobsList,
  jobOutputs,
  listJobs,
  createJob,
  pauseJob,
  resumeJob,
  triggerJob,
  removeJob,
  getJobOutput,
  projectsList,
  activeSessionId,
  onCreateProject,
  onUpdateProject,
  onDeleteProject,
  onLinkSession,
  onUnlinkSession,
  requestProjects,
}: SettingsModalProps) {
  const modalRef = React.useRef<HTMLDivElement>(null)

  // Prefetch ALL tab data when modal opens (prevents flash on tab switch)
  React.useEffect(() => {
    if (isOpen) {
      modalRef.current?.focus()
      requestConfig()
      requestMemory()
      requestToolsets()
      requestSkills()
      requestPermissions()
      listJobs()
      requestProjects()
    }
  }, [isOpen, requestConfig, requestMemory, requestToolsets, requestSkills, requestPermissions, listJobs])

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "var(--color-overlay-backdrop)",
          zIndex: 60,
        }}
      />

      {/* Modal */}
      <div
        ref={modalRef}
        role="dialog"
        aria-label="Settings"
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose()
        }}
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 520,
          maxWidth: "90vw",
          height: "70vh",
          maxHeight: "80vh",
          background: "var(--color-elevated)",
          borderRadius: 8,
          border: "1px solid var(--color-border-dim)",
          zIndex: 70,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          outline: "none",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header + Tabs */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid var(--color-button-bg)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
            {TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => onTabChange(tab)}
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color:
                    activeTab === tab
                      ? "var(--color-text-primary)"
                      : "var(--color-text-tertiary)",
                  background: "transparent",
                  border: "none",
                  borderBottom:
                    activeTab === tab
                      ? "2px solid var(--color-text-secondary)"
                      : "2px solid transparent",
                  cursor: "pointer",
                  padding: "4px 12px 8px 12px",
                  transition: "color 150ms ease, border-color 150ms ease",
                }}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
          <button
            aria-label="Close settings"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: 6,
              color: "var(--color-text-tertiary)",
              borderRadius: 4,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--color-text-secondary)"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--color-text-tertiary)"
            }}
          >
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: "auto", padding: "16px 20px" }}>
          {activeTab === "settings" && (
            <SettingsTab
              configData={configData}
              requestConfig={requestConfig}
              setConfig={setConfig}
              model={model}
              provider={provider}
              agentName={agentName}
              providersData={providersData}
              requestProviders={requestProviders}
            />
          )}
          {activeTab === "memory" && (
            <MemoryTab memoryData={memoryData} requestMemory={requestMemory} />
          )}
          {activeTab === "tools" && (
            <ToolsTab
              toolsetsData={toolsetsData}
              requestToolsets={requestToolsets}
            />
          )}
          {activeTab === "permissions" && (
            <PermissionsTab
              permissionsData={permissionsData}
              requestPermissions={requestPermissions}
              setPermission={setPermission}
            />
          )}
          {activeTab === "tasks" && (
            <TasksTab
              jobsList={jobsList}
              jobOutputs={jobOutputs}
              listJobs={listJobs}
              createJob={createJob}
              pauseJob={pauseJob}
              resumeJob={resumeJob}
              triggerJob={triggerJob}
              removeJob={removeJob}
              getJobOutput={getJobOutput}
            />
          )}
          {activeTab === "projects" && (
            <ProjectsPanel
              projects={projectsList as Project[]}
              activeSessionId={activeSessionId}
              onCreateProject={onCreateProject}
              onUpdateProject={onUpdateProject}
              onDeleteProject={onDeleteProject}
              onLinkSession={onLinkSession}
              onUnlinkSession={onUnlinkSession}
            />
          )}
          {activeTab === "calendar" && (
            <CalendarPanel
              jobs={jobsList}
              onCreateJob={createJob}
              onPauseJob={pauseJob}
              onResumeJob={resumeJob}
              onTriggerJob={triggerJob}
              onRemoveJob={removeJob}
            />
          )}
        </div>
      </div>
    </>
  )
}


/* ═══════════════════════════════════════════════
   Settings Tab
   ═══════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════
   Memory Tab
   ═══════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════
   Tools Tab
   ═══════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════
   Permissions Tab
   ═══════════════════════════════════════════════ */

const PERMISSION_LABELS: Record<string, string> = {
  computer_use: "Computer Use",
  browser_control: "Browser Control",
  file_system: "File System",
  terminal: "Terminal",
  network: "Network",
  memory_write: "Memory Write",
  delegation: "Delegation",
}

const PERMISSION_OPTIONS = ["allowed", "ask", "denied"] as const

/* ═══════════════════════════════════════════════
   Tasks Tab
   ═══════════════════════════════════════════════ */
