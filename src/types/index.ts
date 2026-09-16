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
  totalFocusMs: number
  longestFocusMs: number
  startedAt: number | null
  endsAt: number | null
  pausedRemaining: number | null
  updatedAt: number
}
