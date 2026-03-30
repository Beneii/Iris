"use client"

import * as React from "react"
import type { ConnectionState } from "@/hooks/use-hermes-bridge"

interface IrisEyeTrackingProps {
  size?: number
  status?: "idle" | "processing" | "error"
  connectionState?: ConnectionState
}

/**
 * Large Iris eye that tracks the user's cursor.
 * The pupil (mask circle) and sparkle (diamond) shift toward the mouse position.
 * Uses inline SVG so we can manipulate transforms directly.
 */
export function IrisEyeTracking({ size = 200, status = "idle", connectionState = "connected" }: IrisEyeTrackingProps) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const pupilRef = React.useRef<SVGCircleElement>(null)
  const sparkleRef = React.useRef<SVGPathElement>(null)
  const rafRef = React.useRef<number>(0)
  const targetRef = React.useRef({ x: 0, y: 0 })
  const currentRef = React.useRef({ x: 0, y: 0 })

  // Max pupil travel in SVG-local units (the viewBox is 32x20 for the eye)
  const MAX_SHIFT_X = 4.5
  const MAX_SHIFT_Y = 2.5

  // Smooth lerp animation
  React.useEffect(() => {
    let running = true

    const animate = () => {
      if (!running) return
      const cur = currentRef.current
      const tgt = targetRef.current
      const ease = 0.08

      cur.x += (tgt.x - cur.x) * ease
      cur.y += (tgt.y - cur.y) * ease

      if (pupilRef.current) {
        pupilRef.current.setAttribute("transform", `translate(${16 + cur.x} ${10 + cur.y})`)
      }
      if (sparkleRef.current) {
        // Sparkle moves slightly less than pupil for parallax
        const sx = cur.x * 0.85
        const sy = cur.y * 0.85
        sparkleRef.current.setAttribute("transform", `translate(${sx} ${sy})`)
      }

      rafRef.current = requestAnimationFrame(animate)
    }

    rafRef.current = requestAnimationFrame(animate)
    return () => { running = false; cancelAnimationFrame(rafRef.current) }
  }, [])

  // Mouse + touch tracking
  React.useEffect(() => {
    const updateTarget = (clientX: number, clientY: number) => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2

      // Normalize to -1..1 range based on viewport distance
      const dx = (clientX - centerX) / (window.innerWidth / 2)
      const dy = (clientY - centerY) / (window.innerHeight / 2)

      // Clamp and apply max shift
      targetRef.current = {
        x: Math.max(-1, Math.min(1, dx)) * MAX_SHIFT_X,
        y: Math.max(-1, Math.min(1, dy)) * MAX_SHIFT_Y,
      }
    }

    const handleMouseMove = (e: MouseEvent) => updateTarget(e.clientX, e.clientY)
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) updateTarget(e.touches[0].clientX, e.touches[0].clientY)
    }
    // Reset pupil to center when touch ends
    const handleTouchEnd = () => { targetRef.current = { x: 0, y: 0 } }

    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("touchmove", handleTouchMove, { passive: true })
    window.addEventListener("touchend", handleTouchEnd)
    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("touchmove", handleTouchMove)
      window.removeEventListener("touchend", handleTouchEnd)
    }
  }, [])

  // Blink animation
  const [blinkPhase, setBlinkPhase] = React.useState(0) // 0 = open, 1 = closing, 2 = closed, 3 = opening
  const blinkTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  React.useEffect(() => {
    const scheduleBlink = () => {
      blinkTimerRef.current = setTimeout(() => {
        setBlinkPhase(1) // closing
        setTimeout(() => {
          setBlinkPhase(2) // closed
          setTimeout(() => {
            setBlinkPhase(3) // opening
            setTimeout(() => {
              setBlinkPhase(0) // open
              scheduleBlink()
            }, 80)
          }, 60)
        }, 80)
      }, 3000 + Math.random() * 4000)
    }

    scheduleBlink()
    return () => { if (blinkTimerRef.current) clearTimeout(blinkTimerRef.current) }
  }, [])

  const height = size * 0.6

  // Eyelid squeeze for blink
  const lidScaleY = blinkPhase === 0 ? 1 : blinkPhase === 1 ? 0.15 : blinkPhase === 2 ? 0.02 : 0.4

  // Status-based glow
  const glowColor = status === "error" || connectionState !== "connected"
    ? "rgba(239, 68, 68, 0.3)"
    : status === "processing"
      ? "rgba(91, 164, 246, 0.4)"
      : "rgba(255, 255, 255, 0.08)"

  const glowSize = status === "processing" ? 40 : 20

  return (
    <div
      ref={containerRef}
      style={{
        width: size,
        height,
        position: "relative",
        filter: `drop-shadow(0 0 ${glowSize}px ${glowColor})`,
        transition: "filter 600ms ease",
      }}
    >
      <svg
        viewBox="0 0 320 200"
        width={size}
        height={height}
        style={{ display: "block" }}
      >
        <defs>
          <mask id="iris-eye-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="320" height="200">
            <rect width="320" height="200" fill="#fff" />
            <circle
              ref={pupilRef}
              r="63"
              fill="black"
              transform="translate(160 100)"
            />
          </mask>
        </defs>

        <g
          style={{
            transformOrigin: "160px 100px",
            transform: `scaleY(${lidScaleY})`,
            transition: "transform 80ms ease-in-out",
          }}
        >
          {/* Eye shape (sclera) */}
          <path
            d="M10,100 C10,100 65.5,14 160,14 C254.5,14 310,100 310,100 C310,100 254.5,186 160,186 C65.5,186 10,100 10,100Z"
            fill="white"
            mask="url(#iris-eye-mask)"
          />

          {/* Sparkle / iris highlight */}
          <g ref={sparkleRef} transform="translate(0 0)">
            <path
              d="M160,50 C165,80.6 178.2,93.6 213.3,100 C178.2,106.1 165,119.3 160,150.7 C155,119.3 141.8,101.3 106.7,100 C141.8,93.9 155,80.6 160,50Z"
              fill="white"
              className={status === "processing" ? "iris-sparkle-pulse" : ""}
            />
          </g>
        </g>
      </svg>
    </div>
  )
}
