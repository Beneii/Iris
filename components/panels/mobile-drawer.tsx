"use client"

import * as React from "react"

interface MobileDrawerProps {
  isOpen: boolean
  onClose: () => void
  width?: number
  children: React.ReactNode
}

export function MobileDrawer({ isOpen, onClose, width = 260, children }: MobileDrawerProps) {
  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "var(--color-overlay-backdrop)",
          zIndex: 40,
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? "auto" : "none",
          transition: "opacity 300ms cubic-bezier(0.32, 0.72, 0, 1)",
        }}
      />
      <aside
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width,
          zIndex: 50,
          transform: isOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform 300ms cubic-bezier(0.32, 0.72, 0, 1)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {children}
      </aside>
    </>
  )
}
