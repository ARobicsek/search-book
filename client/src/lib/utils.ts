import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Render a stored HH:MM (24h) start time as a friendly 12h label, e.g. "2:00 PM".
export function formatStartTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm
  const ap = h < 12 ? "AM" : "PM"
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, "0")} ${ap}`
}
