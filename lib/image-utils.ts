"use client"

/**
 * Helpers for detecting when tool output references images so they
 * can be rendered inline in the chat UI.
 */
export const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg)(\?|$)/i
export const IMAGE_TOOL_RE = /screenshot|vision|image|browser_snapshot/i

export function looksLikeImagePath(val: unknown): string | null {
  if (typeof val !== "string") return null
  if (IMAGE_EXT_RE.test(val) || /screenshot/i.test(val)) return val
  return null
}

export function findImageInArgs(args: Record<string, unknown> | string | undefined): string | null {
  if (!args) return null
  if (typeof args === "string") return looksLikeImagePath(args)
  for (const value of Object.values(args)) {
    const found = looksLikeImagePath(value)
    if (found) return found
  }
  return null
}
