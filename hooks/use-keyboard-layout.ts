"use client"

import { useEffect } from "react"

/**
 * Keyboard: resize "native" + hide accessory bar.
 * Scroll reset is handled natively in AppDelegate.swift.
 * Scrolls messages to bottom when keyboard opens.
 */
export function useKeyboardLayout() {
  useEffect(() => {
    if (typeof window === "undefined") return
    const isNative = !!(window as any).Capacitor?.isNativePlatform?.()
    if (!isNative) return

    import("@capacitor/keyboard").then(({ Keyboard }) => {
      Keyboard.setResizeMode({ mode: "native" as any })
      Keyboard.setAccessoryBarVisible({ isVisible: false })

      // Scroll messages to bottom when keyboard opens
      Keyboard.addListener("keyboardDidShow", () => {
        const messagesEl = document.querySelector(".flex-1.overflow-y-auto")
        if (messagesEl) {
          requestAnimationFrame(() => {
            messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: "smooth" })
          })
        }
      })
    }).catch(() => {})
  }, [])
}
