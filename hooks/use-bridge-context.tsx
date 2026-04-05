"use client"

import * as React from "react"
import { useHermesBridge } from "@/hooks/use-hermes-bridge"

type BridgeContextType = ReturnType<typeof useHermesBridge>

const BridgeContext = React.createContext<BridgeContextType | null>(null)

export function BridgeProvider({ children }: { children: React.ReactNode }) {
  const bridge = useHermesBridge()
  return <BridgeContext.Provider value={bridge}>{children}</BridgeContext.Provider>
}

export function useBridge(): BridgeContextType {
  const ctx = React.useContext(BridgeContext)
  if (!ctx) throw new Error("useBridge must be used within BridgeProvider")
  return ctx
}
