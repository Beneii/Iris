"use client"

import { useCallback, useEffect, useMemo } from "react"
import {
  HOME_SESSION_ID,
  type ActivityEntry,
  type BridgeEvent,
  type ConnectionState,
  type CronJob,
  type HermesMessage,
  type JobOutput,
  type MessageSegment,
  type SessionInfo,
  type ToolCall,
  type ToolStatus,
} from "@/types/hermes"
import { useBridgeConnection } from "@/hooks/use-bridge-connection"
import { useBridgeJobs } from "@/hooks/use-bridge-jobs"
import { useBridgeSessions } from "@/hooks/use-bridge-sessions"
import { useBridgeMessages } from "@/hooks/use-bridge-messages"
import { useBridgeConfig } from "@/hooks/use-bridge-config"
import { useBridgeChannels } from "@/hooks/use-bridge-channels"
import { useBridgeProjects } from "@/hooks/use-bridge-projects"
import { useBridgeHealth } from "@/hooks/use-bridge-health"

export {
  HOME_SESSION_ID,
}

export type {
  ActivityEntry,
  ConnectionState,
  CronJob,
  HermesMessage,
  JobOutput,
  MessageSegment,
  SessionInfo,
  ToolCall,
  ToolStatus,
}

export function useHermesBridge() {
  const {
    connectionState,
    sendAction,
    reconnect,
    setOnEvent,
    setOnDisconnect,
  } = useBridgeConnection()

  const {
    sessionsList,
    activeSessionId,
    activities,
    unreadSessions,
    listSessions,
    resumeSession,
    deleteSession: deleteSessionAction,
    newSession,
    activeTarget,
    navigateTo,
    getActiveSessionId,
    setActiveSessionFromEvent,
    updateActivities,
    setActivitiesForSession,
    getCachedActivities,
    markSessionUnread,
    clearUnreadForSession,
    handleEvent: handleSessionEvent,
  } = useBridgeSessions({ sendAction })

  const {
    model,
    provider,
    agentName,
    memoryData,
    configData,
    toolsetsData,
    skillsData,
    permissionsData,
    agentsData,
    providersData,
    requestMemory,
    requestSkills,
    requestConfig,
    requestToolsets,
    requestPermissions,
    requestAgents,
    requestSoul,
    requestProviders,
    setPermission,
    setConfig,
    handleEvent: handleConfigEvent,
    handleConnectionReady: handleConfigConnectionReady,
  } = useBridgeConfig({ sendAction })

  const {
    channelsList,
    requestChannels,
    handleEvent: handleChannelEvent,
    handleConnectionReady: handleChannelConnectionReady,
  } = useBridgeChannels({ sendAction })

  const {
    projectsList,
    requestProjects,
    createProject,
    updateProject: updateProjectAction,
    deleteProject: deleteProjectAction,
    linkSession: linkSessionAction,
    unlinkSession: unlinkSessionAction,
    handleEvent: handleProjectEvent,
  } = useBridgeProjects({ sendAction })

  const {
    queueStatus,
    healthData,
    sessionRoster,
    sessionRosterSessionId,
    evolutionStatus,
    requestQueueStatus,
    requestHealth,
    restartAgent,
    handleEvent: handleHealthEvent,
  } = useBridgeHealth({ sendAction })

  const {
    messages: messageList,
    contextPressure,
    currentStep,
    isProcessing,
    sendMessage,
    sendMessageWithAttachments,
    cancelResponse,
    handleEvent: handleMessageEvent,
    handleConnectionReady: handleMessageConnectionReady,
    handleDisconnect: handleMessageDisconnect,
    resetConversation,
  } = useBridgeMessages({
    sendAction,
    sessions: {
      getActiveSessionId,
      setActiveSessionFromEvent,
      updateActivities,
      setActivitiesForSession,
      getCachedActivities,
      markSessionUnread,
      clearUnreadForSession,
    },
  })
  const jobs = useBridgeJobs(sendAction)

  const handleEvent = useCallback(
    (event: BridgeEvent) => {
      if (event.type === "auth.failed") {
        const key = typeof window !== "undefined" ? window.prompt("Enter Iris API key:") : null
        if (key) {
          window.localStorage.setItem("iris_api_key", key)
          reconnect()
        }
        return
      }

      if (event.type === "connection.ready") {
        handleMessageConnectionReady(event)
        handleConfigConnectionReady(event)
        handleChannelConnectionReady()
        sendAction("list_sessions")
        sendAction("get_agents")
        sendAction("list_channels")
        sendAction("resume_session", { session_id: getActiveSessionId() })
        return
      }

      if (handleMessageEvent(event)) return
      if (handleSessionEvent(event)) return
      if (handleConfigEvent(event)) return
      if (handleChannelEvent(event)) return
      if (handleProjectEvent(event)) return
      if (handleHealthEvent(event)) return
      if (jobs.handleEvent(event)) return
    },
    [
      jobs,
      handleConfigEvent,
      handleConfigConnectionReady,
      handleChannelEvent,
      handleChannelConnectionReady,
      handleProjectEvent,
      handleHealthEvent,
      handleMessageConnectionReady,
      handleMessageEvent,
      handleSessionEvent,
      getActiveSessionId,
      reconnect,
      sendAction,
    ],
  )

  useEffect(() => {
    setOnEvent(handleEvent)
  }, [handleEvent, setOnEvent])

  useEffect(() => {
    setOnDisconnect(handleMessageDisconnect)
  }, [handleMessageDisconnect, setOnDisconnect])

  // Wrap resumeSession to clear messages immediately (no waiting for bridge)
  const resumeSessionWithClear = useCallback(
    (sessionId: string) => {
      if (sessionId !== activeSessionId) {
        resetConversation()
      }
      resumeSession(sessionId)
    },
    [activeSessionId, resumeSession, resetConversation],
  )

  const deleteSession = useCallback(
    (sessionId: string) => {
      const activeId = activeSessionId
      deleteSessionAction(sessionId)
      if (sessionId === activeId) {
        resetConversation()
      }
    },
    [activeSessionId, deleteSessionAction, resetConversation],
  )

  const getSessionTitle = useCallback(
    (sessionId: string): string => {
      const session = sessionsList.find((s) => s.id === sessionId)
      if (session?.title) return session.title
      if (sessionId === activeSessionId) {
        const firstUserMessage = messageList.find((message) => message.role === "user")
        if (firstUserMessage) {
          return firstUserMessage.content.length > 60
            ? `${firstUserMessage.content.slice(0, 60)}...`
            : firstUserMessage.content
        }
      }
      return "Untitled Session"
    },
    [activeSessionId, messageList, sessionsList],
  )

  const activitySummary = useMemo(() => {
    const total = activities.length
    const running = activities.filter((activity) => activity.status === "running" || activity.status === "preparing").length
    const errors = activities.filter((activity) => activity.status === "error").length
    const completed = activities.filter((activity) => activity.status === "success").length
    const successRate = total > 0 ? completed / total : 0
    return { total, running, errors, successRate }
  }, [activities])

  return {
    messages: messageList,
    activities,
    connectionState,
    model,
    provider,
    agentName,
    memoryData,
    configData,
    toolsetsData,
    skillsData,
    permissionsData,
    contextPressure,
    currentStep,
    isProcessing,
    sendMessage,
    newSession,
    agentsData,
    providersData,
    queueStatus,
    sessionRoster,
    sessionRosterSessionId,
    healthData,
    evolutionStatus,
    channelsList,
    requestChannels,
    projectsList,
    requestProjects,
    createProject,
    updateProject: updateProjectAction,
    deleteProject: deleteProjectAction,
    linkSession: linkSessionAction,
    unlinkSession: unlinkSessionAction,
    requestAgents,
    requestProviders,
    requestQueueStatus,
    requestHealth,
    restartAgent,
    requestMemory,
    requestSkills,
    requestConfig,
    requestToolsets,
    requestSoul,
    requestPermissions,
    setPermission,
    setConfig,
    sendAction,
    sessionsList,
    activeSessionId,
    activeTarget,
    navigateTo,
    listSessions,
    resumeSession: resumeSessionWithClear,
    deleteSession,
    jobsList: jobs.jobsList,
    jobOutputs: jobs.jobOutputs,
    listJobs: jobs.listJobs,
    createJob: jobs.createJob,
    pauseJob: jobs.pauseJob,
    resumeJob: jobs.resumeJob,
    triggerJob: jobs.triggerJob,
    removeJob: jobs.removeJob,
    getJobOutput: jobs.getJobOutput,
    sendMessageWithAttachments,
    cancelResponse,
    getSessionTitle,
    reconnect,
    activitySummary,
    unreadSessions,
  }
}
