import type { TimerMode, TimerState } from '../types'

export type TimerCommand =
  | { type: 'start'; mode?: TimerMode }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'skip' }
  | { type: 'reset' }
  | { type: 'getState' }

export type TimerCommandResponse = TimerState
