"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { BridgeEvent, ConnectionState } from "@/types/hermes"

const BRIDGE_URL = (() => {
  if (typeof window === "undefined") return "ws://127.0.0.1:8643/ws"
  const host = window.location.hostname
  if (!host || host === "localhost" || host === "127.0.0.1" || host === "app" || window.location.protocol === "iris:") {
    return "ws://127.0.0.1:8643/ws"
  }
  return `ws://${host}:8643/ws`
})()

type EventHandler = (event: BridgeEvent) => void
type DisconnectHandler = () => void

export function useBridgeConnection() {
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting")
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectAttempts = useRef(0)
  const eventHandlerRef = useRef<EventHandler>(() => {})
  const disconnectHandlerRef = useRef<DisconnectHandler>(() => {})

  const sendAction = useCallback((action: string, data?: Record<string, unknown>) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    wsRef.current.send(JSON.stringify({ action, ...data }))
  }, [])

  const connect = useCallback(() => {
    if (typeof window === "undefined") return
    if (wsRef.current) {
      const state = wsRef.current.readyState
      if (state === WebSocket.OPEN || state === WebSocket.CONNECTING) {
        wsRef.current.close()
      }
      wsRef.current = null
    }

    const ws = new WebSocket(BRIDGE_URL)
    wsRef.current = ws

    ws.onopen = () => {
      if (wsRef.current !== ws) {
        ws.close()
        return
      }
      setConnectionState("connected")
      reconnectAttempts.current = 0
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current)
      }
      reconnectTimer.current = null

      const host = window.location.hostname
      const isLocal = !host || host === "localhost" || host === "127.0.0.1" || host === "app" || window.location.protocol === "iris:"
      if (!isLocal) {
        const apiKey = window.localStorage.getItem("iris_api_key") || ""
        if (apiKey) {
          ws.send(JSON.stringify({ api_key: apiKey }))
        }
      }
      ws.send(JSON.stringify({ action: "app_state", state: "foreground" }))
    }

    ws.onmessage = (event) => {
      if (wsRef.current !== ws) return
      try {
        const parsed = JSON.parse(event.data) as BridgeEvent
        eventHandlerRef.current(parsed)
      } catch {
        // ignore parse errors
      }
    }

    ws.onerror = () => {
      ws.close()
    }

    ws.onclose = () => {
      if (wsRef.current !== ws) return
      wsRef.current = null
      disconnectHandlerRef.current()
      // Always clear pending reconnect timer before scheduling a new one
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current)
        reconnectTimer.current = null
      }
      reconnectAttempts.current += 1
      if (reconnectAttempts.current >= 10) {
        setConnectionState("disconnected")
        // Don't give up forever — try again after 30s
        reconnectTimer.current = setTimeout(() => {
          reconnectAttempts.current = 0
          connect()
        }, 30000)
        return
      }
      setConnectionState("connecting")
      const delay = reconnectAttempts.current <= 3 ? 3000 : 5000
      reconnectTimer.current = setTimeout(connect, delay)
    }
  }, [])

  const setOnEvent = useCallback((handler: EventHandler) => {
    eventHandlerRef.current = handler
  }, [])

  const setOnDisconnect = useCallback((handler: DisconnectHandler) => {
    disconnectHandlerRef.current = handler
  }, [])

  const reconnect = useCallback(() => {
    reconnectAttempts.current = 0
    setConnectionState("connecting")
    connect()
  }, [connect])

  useEffect(() => {
    connect()
    return () => {
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current)
      }
      reconnectTimer.current = null
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [connect])

  useEffect(() => {
    if (typeof window === "undefined") return
    const onFocus = () => sendAction("app_state", { state: "foreground" })
    const onBlur = () => sendAction("app_state", { state: "background" })
    window.addEventListener("focus", onFocus)
    window.addEventListener("blur", onBlur)
    return () => {
      window.removeEventListener("focus", onFocus)
      window.removeEventListener("blur", onBlur)
    }
  }, [sendAction])

  useEffect(() => {
    if (typeof window === "undefined") return
    const cleanup: Array<() => void> = []

    const sendAppState = (state: "foreground" | "background") => {
      sendAction("app_state", { state })
    }

    const tryInit = (attempt = 0) => {
      const cap = (window as any).Capacitor
        if (!cap?.isNativePlatform?.()) {
          if (attempt < 10) {
            setTimeout(() => tryInit(attempt + 1), 500)
          }
          return
        }

      sendAppState("foreground")

      Promise.all([
        import("@capacitor/push-notifications").catch(() => null),
        import("@capacitor/app").catch(() => null),
      ]).then(([pushMod, appMod]) => {
        if (pushMod) {
          const { PushNotifications } = pushMod
          PushNotifications.addListener("registration", (token) => {
            sendAction("register_push_token", { token: token.value, platform: "ios" })
          }).then((l) => cleanup.push(() => l.remove()))
          PushNotifications.addListener("registrationError", () => {}).then((l) => cleanup.push(() => l.remove()))
          PushNotifications.requestPermissions().then((perm) => {
            sendAction("debug", { msg: `push_permission_${perm.receive}` })
            if (perm.receive === "granted") PushNotifications.register()
          }).catch((err) => {
            sendAction("debug", { msg: `push_error_${err}` })
          })
        }
        if (appMod) {
          const { App: CapApp } = appMod
          CapApp.addListener("appStateChange", ({ isActive }) => {
            sendAppState(isActive ? "foreground" : "background")
            if (isActive && pushMod) {
              pushMod.PushNotifications.removeAllDeliveredNotifications().catch(() => {})
            }
          }).then((l) => cleanup.push(() => l.remove()))
        }
      })
    }

    tryInit()

    return () => {
      cleanup.forEach((fn) => fn())
    }
  }, [sendAction])

  return {
    connectionState,
    sendAction,
    reconnect,
    setOnEvent,
    setOnDisconnect,
  }
}
