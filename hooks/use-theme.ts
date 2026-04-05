"use client"

import { useCallback, useEffect, useState } from "react"

type Theme = "dark" | "light"

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("dark")
  const [glass, setGlassState] = useState(false)

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("iris-theme") as Theme | null
    const savedGlass = localStorage.getItem("iris-glass") === "true"
    if (saved) {
      setThemeState(saved)
      document.documentElement.setAttribute("data-theme", saved)
    }
    if (savedGlass) {
      setGlassState(true)
      document.documentElement.setAttribute("data-glass", "true")
    }
  }, [])

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t)
    localStorage.setItem("iris-theme", t)
    document.documentElement.setAttribute("data-theme", t)
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark")
  }, [theme, setTheme])

  const setGlass = useCallback((on: boolean) => {
    setGlassState(on)
    localStorage.setItem("iris-glass", String(on))
    if (on) {
      document.documentElement.setAttribute("data-glass", "true")
    } else {
      document.documentElement.removeAttribute("data-glass")
    }
  }, [])

  const toggleGlass = useCallback(() => {
    setGlass(!glass)
  }, [glass, setGlass])

  return { theme, glass, setTheme, toggleTheme, setGlass, toggleGlass }
}
