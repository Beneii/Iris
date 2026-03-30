import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/* ─── Truncate long JSON values for display ─── */
export function truncateJsonValues(
  obj: Record<string, unknown>,
  maxLen = 200,
): string {
  const truncated = Object.fromEntries(
    Object.entries(obj).map(([k, v]) => {
      if (typeof v === "string" && v.length > maxLen) {
        return [k, v.slice(0, maxLen) + "..."]
      }
      return [k, v]
    }),
  )
  return JSON.stringify(truncated, null, 2)
}
