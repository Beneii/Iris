"use client"

import { useCallback, useState } from "react"
import type { BridgeEvent } from "@/types/hermes"

export type ChannelData = {
  id: string
  name: string
  status: string
  project_id?: string
  created_at?: number
  agent_ids?: string[]
}

interface UseBridgeChannelsOptions {
  sendAction: (action: string, data?: Record<string, unknown>) => void
}

export function useBridgeChannels({ sendAction }: UseBridgeChannelsOptions) {
  const [channelsList, setChannelsList] = useState<ChannelData[]>([])

  const requestChannels = useCallback(() => sendAction("list_channels"), [sendAction])

  const handleConnectionReady = useCallback(() => {
    requestChannels()
  }, [requestChannels])

  const handleEvent = useCallback((event: BridgeEvent): boolean => {
    switch (event.type) {
      case "channels.list":
        setChannelsList((event.channels as ChannelData[]) || [])
        return true
      case "channel.created":
      case "channel.archived":
      case "channel.unarchived":
      case "channel.updated":
        requestChannels()
        return true
      default:
        return false
    }
  }, [requestChannels])

  return {
    channelsList,
    requestChannels,
    handleEvent,
    handleConnectionReady,
  }
}
