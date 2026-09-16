import { DOMAIN_KEY, SCREEN_TIME_KEY, STORAGE_KEY } from '../shared/constants'
import type {
  DailyStats,
  DomainState,
  ScreenTimeState,
  TimerState,
} from '../types'

const getDate = () => new Date().toLocaleDateString('en-CA')

const buildTopDomains = (
  domainState: DomainState | undefined,
): { domain: string; ms: number }[] => {
  if (!domainState) return []

  const totals = { ...domainState.totals }

  if (domainState.currentDomain && domainState.startedAt) {
    totals[domainState.currentDomain] =
      (totals[domainState.currentDomain] ?? 0) +
      (Date.now() - domainState.startedAt)
  }

  return Object.entries(totals)
    .map(([domain, ms]) => ({ domain, ms }))
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 3)
}

const eyeRestCount = (timer: TimerState | undefined): number => {
  if (!timer) return 0
  return Object.values(timer.eyeReminders).filter(Boolean).length
}

export async function updateDailyStats(): Promise<void> {
  const date = getDate()
  const key = `ordinaryPomDaily:${date}`

  const stored = await chrome.storage.local.get([
    STORAGE_KEY,
    SCREEN_TIME_KEY,
    DOMAIN_KEY,
  ])
  const timer =
    (stored[STORAGE_KEY] as TimerState | undefined) ??
    ({} as Partial<TimerState>)
  const screen =
    (stored[SCREEN_TIME_KEY] as ScreenTimeState | undefined) ??
    ({} as Partial<ScreenTimeState>)
  const domain =
    (stored[DOMAIN_KEY] as DomainState | undefined) ??
    ({} as Partial<DomainState>)

  const stats: DailyStats = {
    date,
    totalFocusMs: timer.totalFocusMs ?? 0,
    completedSessions: timer.completedSessions ?? 0,
    totalBreakMs: timer.totalBreakMs ?? 0,
    longestFocusMs: timer.longestFocusMs ?? 0,
    longestScreenMs: screen.longestScreenMs ?? 0,
    eyeRestReminders: eyeRestCount(timer as TimerState),
    topDomains: buildTopDomains(domain as DomainState),
  }

  await chrome.storage.local.set({ [key]: stats })
}
