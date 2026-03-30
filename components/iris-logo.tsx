"use client"

import * as React from "react"

interface IrisLogoProps {
  size?: number
  className?: string
  status?: "idle" | "processing" | "error"
}

const SVG_PATHS = ["/iris-static.svg", "/iris-blink.svg", "/iris-look-right.svg", "/iris-look-left.svg", "/iris-shake.svg"]
const svgCache: Record<string, string> = {}
let preloaded = false

function preloadSvgs() {
  if (preloaded) return
  preloaded = true
  SVG_PATHS.forEach((p) => fetch(p).then((r) => r.text()).then((t) => { svgCache[p] = t }).catch(() => {}))
}

function makeBlobUrl(path: string): string | null {
  const text = svgCache[path]
  if (!text) return null
  return URL.createObjectURL(new Blob([text], { type: "image/svg+xml" }))
}

/**
 * Double-buffered object tags. One is visible while the other loads the next animation.
 * When the new one is ready (onload fires), swap visibility. No flash.
 */
export function IrisLogo({ size = 24, className, status = "idle" }: IrisLogoProps) {
  const [currentPath, setCurrentPath] = React.useState("/iris-static.svg")
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = React.useRef(true)

  // Double buffer refs
  const objARef = React.useRef<HTMLObjectElement>(null)
  const objBRef = React.useRef<HTMLObjectElement>(null)
  const activeRef = React.useRef<"a" | "b">("a") // which one is currently visible
  const blobsRef = React.useRef<string[]>([])

  React.useEffect(() => {
    preloadSvgs()
    mountedRef.current = true
    // Load static into slot A initially
    const t = setTimeout(() => {
      const url = makeBlobUrl("/iris-static.svg")
      if (url && objARef.current) {
        blobsRef.current.push(url)
        objARef.current.data = url
        objARef.current.style.opacity = "1"
      }
    }, 300)
    return () => {
      mountedRef.current = false
      clearTimeout(t)
      blobsRef.current.forEach(URL.revokeObjectURL)
    }
  }, [])

  // When path changes, load into the inactive slot, then swap on load
  React.useEffect(() => {
    const loadIntoInactive = () => {
      const url = makeBlobUrl(currentPath)
      if (!url) {
        // Cache not ready, retry
        setTimeout(loadIntoInactive, 100)
        return
      }
      blobsRef.current.push(url)

      const inactive = activeRef.current === "a" ? objBRef.current : objARef.current
      const active = activeRef.current === "a" ? objARef.current : objBRef.current
      if (!inactive || !active) return

      inactive.onload = () => {
        // New one is ready — show it instantly, then hide old
        inactive.style.transition = "none"
        inactive.style.opacity = "1"
        requestAnimationFrame(() => {
          active.style.transition = "none"
          active.style.opacity = "0"
        })
        activeRef.current = activeRef.current === "a" ? "b" : "a"
      }
      inactive.data = url
    }
    loadIntoInactive()
  }, [currentPath])

  // Animation cycle
  React.useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)

    if (status === "processing") {
      setCurrentPath("/iris-shake.svg")
      return
    }
    if (status === "error") {
      setCurrentPath("/iris-static.svg")
      return
    }

    const animations = [
      { src: "/iris-blink.svg", duration: 1200 },
      { src: "/iris-look-right.svg", duration: 2500 },
      { src: "/iris-look-left.svg", duration: 2500 },
      { src: "/iris-blink.svg", duration: 1200 },
    ]
    let idx = 0

    const cycle = () => {
      if (!mountedRef.current) return
      const anim = animations[idx % animations.length]
      setCurrentPath(anim.src)
      idx++
      timerRef.current = setTimeout(() => {
        if (!mountedRef.current) return
        setCurrentPath("/iris-static.svg")
        timerRef.current = setTimeout(cycle, 4000 + Math.random() * 4000)
      }, anim.duration)
    }

    setCurrentPath("/iris-static.svg")
    timerRef.current = setTimeout(cycle, 2000)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [status])

  const height = size * 0.6

  return (
    <div style={{ width: size, height, position: "relative" }} className={className}>
      <object
        ref={objARef}
        type="image/svg+xml"
        width={size}
        height={height}
        style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none", display: "block", opacity: 0, transition: "none" }}
      />
      <object
        ref={objBRef}
        type="image/svg+xml"
        width={size}
        height={height}
        style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none", display: "block", opacity: 0, transition: "none" }}
      />
    </div>
  )
}

export default IrisLogo
