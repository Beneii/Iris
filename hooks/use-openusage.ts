// Stub — provider usage tracking (not yet implemented)
export type UsageLineProgress = {
  type: string
  label: string
  used: number
  limit: number
  percent: number
}

export type ProviderUsage = {
  id: string
  providerId: string
  lines: UsageLineProgress[]
  loading: boolean
}

export function useProviderUsage(_ids?: string[]): { providers: ProviderUsage[]; isAvailable: boolean } {
  return { providers: [], isAvailable: false }
}
