export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`
}

export function formatTotalMinutes(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000))
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60

  if (hours > 0) {
    return `${hours}h ${remainder}m`
  }

  return `${minutes}m`
}
