export type TimerMode = 'lowEnergy' | 'normal' | 'deepWork'

export interface ModeConfig {
  focus: number
  break: number
}

export type TimerPhase = 'focus' | 'break'
export type TimerStatus = 'idle' | 'running' | 'paused'

export const MODES: Record<TimerMode, ModeConfig> = {
  lowEnergy: { focus: 25 * 60_000, break: 5 * 60_000 },
  normal: { focus: 45 * 60_000, break: 10 * 60_000 },
  deepWork: { focus: 60 * 60_000, break: 10 * 60_000 },
} as const

export const DEFAULT_MODE: TimerMode = 'normal'

export interface TimerState {
  status: TimerStatus
  phase: TimerPhase | null
  mode: TimerMode
  sessionNumber: number
  completedSessions: number
  currentFocusMs: number
  currentBreakMs: number
  totalFocusMs: number
  totalBreakMs: number
  longestFocusMs: number
  eyeReminders: Record<number, boolean>
  startedAt: number | null
  endsAt: number | null
  pausedRemaining: number | null
  updatedAt: number
}

export interface ScreenTimeState {
  screenTimeMs: number
  longestScreenMs: number
  consecutiveIdleMinutes: number
  lastUpdatedAt: number
  shown: Record<number, boolean>
}

export interface DomainState {
  currentDomain: string | null
  startedAt: number | null
  totals: Record<string, number>
  lastUpdatedAt: number
}

export interface DailyStats {
  date: string
  totalFocusMs: number
  completedSessions: number
  totalBreakMs: number
  longestFocusMs: number
  longestScreenMs: number
  eyeRestReminders: number
  topDomains: { domain: string; ms: number }[]
}
