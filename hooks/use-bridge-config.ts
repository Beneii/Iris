"use client"

import { useCallback, useState } from "react"
import type { BridgeEvent, LiveAgentData } from "@/types/hermes"

type MemoryData = { memory: string; user: string }
type ToolsetInfo = { name: string; available: boolean; tools: string[]; requirements: string[] }
type SkillInfo = { name: string; category: string; description: string; enabled: boolean }
type ProviderInfo = { id: string; name: string; configured: boolean; base_url: string; default_model: string; models: string[] }

interface UseBridgeConfigOptions {
  sendAction: (action: string, data?: Record<string, unknown>) => void
}

export function useBridgeConfig({ sendAction }: UseBridgeConfigOptions) {
  const [model, setModel] = useState("claude-opus-4-6")
  const [provider, setProvider] = useState("anthropic")
  const [agentName, setAgentName] = useState("Hermes")
  const [memoryData, setMemoryData] = useState<MemoryData | null>(null)
  const [configData, setConfigData] = useState<Record<string, unknown> | null>(null)
  const [toolsetsData, setToolsetsData] = useState<ToolsetInfo[] | null>(null)
  const [skillsData, setSkillsData] = useState<SkillInfo[] | null>(null)
  const [permissionsData, setPermissionsData] = useState<Record<string, string> | null>(null)
  const [agentsData, setAgentsData] = useState<LiveAgentData[] | null>(null)
  const [providersData, setProvidersData] = useState<ProviderInfo[] | null>(null)

  const requestMemory = useCallback(() => sendAction("get_memory"), [sendAction])
  const requestSkills = useCallback(() => sendAction("get_skills"), [sendAction])
  const requestConfig = useCallback(() => sendAction("get_config"), [sendAction])
  const requestToolsets = useCallback(() => sendAction("get_toolsets"), [sendAction])
  const requestPermissions = useCallback(() => sendAction("get_permissions"), [sendAction])
  const requestAgents = useCallback(() => sendAction("get_agents"), [sendAction])
  const requestSoul = useCallback(() => sendAction("get_soul"), [sendAction])
  const requestProviders = useCallback(() => sendAction("list_providers"), [sendAction])

  const setPermission = useCallback((category: string, value: string) => {
    sendAction("set_permissions", { category, value })
  }, [sendAction])

  const setConfig = useCallback((key: string, value: unknown) => {
    sendAction("set_config", { key, value })
  }, [sendAction])

  const handleConnectionReady = useCallback((event: BridgeEvent) => {
    if (typeof event.model === "string") setModel(event.model)
    if (typeof event.provider === "string") setProvider(event.provider)
    if (typeof event.agent_name === "string") setAgentName(event.agent_name)
  }, [])

  const handleEvent = useCallback((event: BridgeEvent): boolean => {
    switch (event.type) {
      case "memory.state":
        setMemoryData({
          memory: (event.memory as string) || "",
          user: (event.user as string) || "",
        })
        return true
      case "agents.list":
        setAgentsData((event.agents as LiveAgentData[]) || null)
        return true
      case "toolsets.list":
        setToolsetsData((event.toolsets as ToolsetInfo[]) || [])
        return true
      case "skills.list":
        setSkillsData((event.skills as SkillInfo[]) || [])
        return true
      case "providers.list":
        setProvidersData((event.providers as ProviderInfo[]) || [])
        return true
      case "config.state":
        if (typeof event.model === "string") setModel(event.model)
        if (typeof event.provider === "string") setProvider(event.provider)
        if (typeof event.agent_name === "string") setAgentName(event.agent_name)
        setConfigData({
          model: event.model,
          provider: event.provider,
          agent_name: event.agent_name,
          base_url: event.base_url,
          ...((event.config as Record<string, unknown>) || {}),
        })
        return true
      case "permissions.state":
        setPermissionsData((event.permissions as Record<string, string>) || null)
        return true
      default:
        return false
    }
  }, [])

  return {
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
    handleEvent,
    handleConnectionReady,
  }
}
