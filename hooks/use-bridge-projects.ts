"use client"

import { useCallback, useState } from "react"
import type { BridgeEvent, Project } from "@/types/hermes"

interface UseBridgeProjectsOptions {
  sendAction: (action: string, data?: Record<string, unknown>) => void
}

export function useBridgeProjects({ sendAction }: UseBridgeProjectsOptions) {
  const [projectsList, setProjectsList] = useState<Project[]>([])

  const requestProjects = useCallback(() => sendAction("list_projects"), [sendAction])

  const createProject = useCallback((data: { name: string; description?: string; agents?: string[] }) =>
    sendAction("create_project", data), [sendAction])

  const updateProject = useCallback((projectId: string, data: Record<string, unknown>) =>
    sendAction("update_project", { project_id: projectId, ...data }), [sendAction])

  const deleteProject = useCallback((projectId: string) =>
    sendAction("delete_project", { project_id: projectId }), [sendAction])

  const linkSession = useCallback((projectId: string, sessionId: string) =>
    sendAction("link_session_to_project", { project_id: projectId, session_id: sessionId }), [sendAction])

  const unlinkSession = useCallback((projectId: string, sessionId: string) =>
    sendAction("unlink_session_from_project", { project_id: projectId, session_id: sessionId }), [sendAction])

  const handleEvent = useCallback((event: BridgeEvent): boolean => {
    switch (event.type) {
      case "projects.list":
        setProjectsList((event.projects as Project[]) || [])
        return true
      case "project.created":
      case "project.updated":
      case "project.deleted":
        requestProjects()
        return true
      default:
        return false
    }
  }, [requestProjects])

  return {
    projectsList,
    requestProjects,
    createProject,
    updateProject,
    deleteProject,
    linkSession,
    unlinkSession,
    handleEvent,
  }
}
