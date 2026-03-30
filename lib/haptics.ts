import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics"

function isNative(): boolean {
  if (typeof window === "undefined") return false
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return !!(window as any).Capacitor?.isNativePlatform?.()
}

export async function hapticLight() {
  if (!isNative()) return
  try { await Haptics.impact({ style: ImpactStyle.Light }) } catch {}
}

export async function hapticMedium() {
  if (!isNative()) return
  try { await Haptics.impact({ style: ImpactStyle.Medium }) } catch {}
}

export async function hapticHeavy() {
  if (!isNative()) return
  try { await Haptics.impact({ style: ImpactStyle.Heavy }) } catch {}
}

export async function hapticSuccess() {
  if (!isNative()) return
  try { await Haptics.notification({ type: NotificationType.Success }) } catch {}
}

export async function hapticError() {
  if (!isNative()) return
  try { await Haptics.notification({ type: NotificationType.Error }) } catch {}
}

export async function hapticWarning() {
  if (!isNative()) return
  try { await Haptics.notification({ type: NotificationType.Warning }) } catch {}
}
