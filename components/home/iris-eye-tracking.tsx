"use client"

import * as React from "react"
import type { ConnectionState } from "@/hooks/use-hermes-bridge"

interface IrisEyeTrackingProps {
  size?: number
  status?: "idle" | "processing" | "error"
  connectionState?: ConnectionState
}

/**
 * Large Iris eye that tracks cursor. Matches the original iris-static.svg geometry exactly:
 * viewBox 32x20, eye path, mask circle r=6.2 at (16,10), sparkle diamond at (16,~10).
 * Scaled up via viewBox → container size.
 */
export function IrisEyeTracking({ size = 200, status = "idle", connectionState = "connected" }: IrisEyeTrackingProps) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const rafRef = React.useRef<number>(0)
  const targetRef = React.useRef({ x: 0, y: 0 })
  const currentRef = React.useRef({ x: 0, y: 0 })

  // In the 32x20 coordinate space
  const CX = 16, CY = 10
  const MAX_X = 3.8, MAX_Y = 2.0

  // Smooth lerp
  React.useEffect(() => {
    let running = true
    const animate = () => {
      if (!running) return
      const c = currentRef.current, t = targetRef.current
      c.x += (t.x - c.x) * 0.07
      c.y += (t.y - c.y) * 0.07

      const pupil = document.getElementById("iris-track-pupil")
      const spark = document.getElementById("iris-track-sparkle")
      if (pupil) pupil.setAttribute("transform", `translate(${CX + c.x} ${CY + c.y})`)
      if (spark) spark.setAttribute("transform", `translate(${c.x * 0.8} ${c.y * 0.8})`)

      rafRef.current = requestAnimationFrame(animate)
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => { running = false; cancelAnimationFrame(rafRef.current) }
  }, [])

  // Mouse + touch
  React.useEffect(() => {
    const update = (cx: number, cy: number) => {
      if (!containerRef.current) return
      const r = containerRef.current.getBoundingClientRect()
      const dx = (cx - (r.left + r.width / 2)) / (window.innerWidth / 2)
      const dy = (cy - (r.top + r.height / 2)) / (window.innerHeight / 2)
      targetRef.current = {
        x: Math.max(-1, Math.min(1, dx)) * MAX_X,
        y: Math.max(-1, Math.min(1, dy)) * MAX_Y,
      }
    }
    const onMouse = (e: MouseEvent) => update(e.clientX, e.clientY)
    const onTouch = (e: TouchEvent) => { if (e.touches[0]) update(e.touches[0].clientX, e.touches[0].clientY) }
    const onTouchEnd = () => { targetRef.current = { x: 0, y: 0 } }

    window.addEventListener("mousemove", onMouse)
    window.addEventListener("touchmove", onTouch, { passive: true })
    window.addEventListener("touchend", onTouchEnd)
    return () => {
      window.removeEventListener("mousemove", onMouse)
      window.removeEventListener("touchmove", onTouch)
      window.removeEventListener("touchend", onTouchEnd)
    }
  }, [])

  // Blink
  const [blink, setBlink] = React.useState(1) // scaleY
  React.useEffect(() => {
    let tid: ReturnType<typeof setTimeout>
    const doBlink = () => {
      setBlink(0.08)
      setTimeout(() => setBlink(1), 120)
      tid = setTimeout(doBlink, 3000 + Math.random() * 5000)
    }
    tid = setTimeout(doBlink, 2000 + Math.random() * 3000)
    return () => clearTimeout(tid)
  }, [])

  const h = size * 0.625 // aspect ratio of 32:20
  const isError = status === "error" || connectionState !== "connected"
  const isProcessing = status === "processing"

  return (
    <div
      ref={containerRef}
      style={{ width: size, height: h, position: "relative" }}
    >
      {/* Glow layer behind */}
      <div style={{
        position: "absolute",
        inset: "-30%",
        borderRadius: "50%",
        background: isError
          ? "radial-gradient(circle, rgba(239,68,68,0.15) 0%, transparent 70%)"
          : isProcessing
            ? "radial-gradient(circle, rgba(91,164,246,0.12) 0%, transparent 70%)"
            : "radial-gradient(circle, rgba(255,255,255,0.04) 0%, transparent 70%)",
        transition: "background 800ms ease",
        pointerEvents: "none",
      }} />

      <svg
        viewBox="0 0 32 20"
        width={size}
        height={h}
        style={{ display: "block", position: "relative" }}
      >
        <defs>
          <mask id="iris-track-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="32" height="20">
            <rect width="32" height="20" fill="white" />
            <circle
              id="iris-track-pupil"
              r="6.2"
              fill="black"
              transform={`translate(${CX} ${CY})`}
            />
          </mask>
        </defs>

        <g style={{
          transformOrigin: "16px 10px",
          transform: `scaleY(${blink})`,
          transition: "transform 100ms ease-in-out",
        }}>
          {/* Sclera with pupil cutout */}
          <path
            d="M1,10c0,0,5.5-8.5,15-8.5s15,8.5,15,8.5-5.5,8.5-15,8.5-15-8.5-15-8.5Z"
            fill="white"
            mask="url(#iris-track-mask)"
          />

          {/* Sparkle / iris diamond */}
          <g id="iris-track-sparkle" transform="translate(0 0)">
            <path
              d="M16,4.5c.5,3,2.2,4.7,5.2,5.3-3,.6-4.7,2.4-5.2,5.4-.5-3-2.2-4.8-5.2-5.4c3-.6,4.7-2.3,5.2-5.3Z"
              fill="white"
              className={isProcessing ? "iris-sparkle-pulse" : ""}
              style={{ transformOrigin: "16px 10px" }}
            />
          </g>
        </g>
      </svg>
    </div>
  )
}
