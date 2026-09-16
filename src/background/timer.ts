import { DEFAULT_MODE, MODES, type TimerMode, type TimerPhase, type TimerState } from '../types'
import { ALARM_NAME, EYE_BREAK_20, EYE_BREAK_40, STORAGE_KEY } from '../shared/constants'

const now = () => Date.now()

const TWENTY_MINUTES = 20 * 60_000
const FORTY_MINUTES = 40 * 60_000
const EYE_MESSAGES: Record<number, string> = {
  [TWENTY_MINUTES]: 'Look away for 20 seconds.',
  [FORTY_MINUTES]: 'Give your eyes a short rest.',
}
const EYE_THRESHOLDS = [TWENTY_MINUTES, FORTY_MINUTES] as const

// Create the initial state for the timer
const createInitialState = (): TimerState => ({
  status: 'idle',
  phase: null,
  mode: DEFAULT_MODE,
  sessionNumber: 0,
  completedSessions: 0,
  currentFocusMs: 0,
  currentBreakMs: 0,
  totalFocusMs: 0,
  totalBreakMs: 0,
  longestFocusMs: 0,
  eyeReminders: {},
  startedAt: null,
  endsAt: null,
  pausedRemaining: null,
  updatedAt: now(),
})

// Load the timer state from storage
export async function loadState(): Promise<TimerState> {
  const stored = await chrome.storage.local.get(STORAGE_KEY)
  const saved = stored[STORAGE_KEY] as Partial<TimerState> | undefined
  return { ...createInitialState(), ...(saved ?? {}) }
}

// Save the timer state to storage
export async function saveState(state: TimerState): Promise<TimerState> {
  const updated: TimerState = { ...state, updatedAt: now() }
  await chrome.storage.local.set({ [STORAGE_KEY]: updated })
  return updated
}

// Set a browser alarm to trigger at a specific time
async function setAlarm(when: number): Promise<void> {
  await chrome.alarms.clear(ALARM_NAME)
  await chrome.alarms.create(ALARM_NAME, { when })
}

// Clear the browser alarm
async function clearAlarm(): Promise<void> {
  await chrome.alarms.clear(ALARM_NAME)
}

async function clearEyeBreakAlarms(): Promise<void> {
  await chrome.alarms.clear(EYE_BREAK_20)
  await chrome.alarms.clear(EYE_BREAK_40)
}

async function setEyeBreakAlarms(state: TimerState, t = now()): Promise<void> {
  await clearEyeBreakAlarms()

  if (state.phase !== 'focus' || state.status !== 'running' || state.startedAt == null) {
    return
  }

  for (const threshold of EYE_THRESHOLDS) {
    if (state.eyeReminders[threshold]) continue

    const remaining = threshold - state.currentFocusMs
    if (remaining <= 0) continue

    const when = state.startedAt + remaining
    if (when >= (state.endsAt ?? Number.POSITIVE_INFINITY)) continue

    const name = threshold === TWENTY_MINUTES ? EYE_BREAK_20 : EYE_BREAK_40
    await chrome.alarms.create(name, { when })
  }
}

// Get the focus duration for a given mode
function focusDuration(mode: TimerMode): number {
  return MODES[mode].focus
}

// Get the break duration for a given mode
function breakDuration(mode: TimerMode): number {
  return MODES[mode].break
}

// Enter the focus phase of the timer
function enterFocus(state: TimerState, mode: TimerMode, t = now()): TimerState {
  return {
    ...state,
    status: 'running',
    phase: 'focus',
    mode,
    sessionNumber: state.sessionNumber + 1,
    currentFocusMs: 0,
    currentBreakMs: 0,
    eyeReminders: {},
    startedAt: t,
    endsAt: t + focusDuration(mode),
    pausedRemaining: null,
  }
}

// Enter the break phase of the timer
function enterBreak(state: TimerState, t = now()): TimerState {
  return {
    ...state,
    status: 'running',
    phase: 'break',
    startedAt: t,
    endsAt: t + breakDuration(state.mode),
    pausedRemaining: null,
  }
}

// Transition to the next phase of the timer - focus to break or break to focus
function transitionToNextPhase(state: TimerState, t = now()): TimerState {
  if (state.phase === 'focus') {
    const segment = state.startedAt != null ? Math.max(0, t - state.startedAt) : 0
    const focusElapsed = state.currentFocusMs + segment

    return {
      ...state,
      phase: 'break',
      completedSessions: state.completedSessions + 1,
      currentFocusMs: 0,
      currentBreakMs: 0,
      totalFocusMs: state.totalFocusMs + segment,
      longestFocusMs: Math.max(state.longestFocusMs, focusElapsed),
      eyeReminders: {},
      startedAt: t,
      endsAt: t + breakDuration(state.mode),
      pausedRemaining: null,
    }
  }

  if (state.phase === 'break') {
    const segment = state.startedAt != null ? Math.max(0, t - state.startedAt) : 0

    return {
      ...enterFocus(state, state.mode, t),
      totalBreakMs: state.totalBreakMs + segment,
      currentBreakMs: 0,
    }
  }

  return state
}

// Reconcile the timer state with the current time
function reconcileState(state: TimerState, t = now()): TimerState {
  let current = state
  let guard = 0

  while (
    current.status === 'running' &&
    current.endsAt != null &&
    current.endsAt <= t &&
    guard < 100
  ) {
    current = transitionToNextPhase(current, current.endsAt)
    guard++
  }

  return current
}

// Ensure the timer state is up-to-date with the current time
export async function ensureState(): Promise<TimerState> {
  const state = await loadState()
  return reconcileState(state)
}

// Start the timer with an optional mode
export async function startTimer(mode?: TimerMode): Promise<TimerState> {
  const state = await ensureState()

  if (state.status !== 'idle') {
    return state
  }

  const selectedMode = mode ?? state.mode ?? DEFAULT_MODE
  const t = now()
  const fresh: TimerState = {
    ...state,
    status: 'idle',
    phase: null,
    mode: selectedMode,
    sessionNumber: 0,
    currentFocusMs: 0,
    currentBreakMs: 0,
    startedAt: null,
    endsAt: null,
    pausedRemaining: null,
    eyeReminders: {},
    updatedAt: t,
  }

  const next = enterFocus(fresh, selectedMode, t)
  await setAlarm(next.endsAt!)
  await setEyeBreakAlarms(next, t)
  return saveState(next)
}

// Pause the timer
export async function pauseTimer(): Promise<TimerState> {
  const state = await ensureState()
  const t = now()

  if (state.status !== 'running' || state.endsAt == null || state.startedAt == null) {
    return state
  }

  const elapsed = t - state.startedAt
  const remaining = state.endsAt - t

  const next: TimerState = {
    ...state,
    status: 'paused',
    currentFocusMs:
      state.phase === 'focus' ? state.currentFocusMs + Math.max(0, elapsed) : state.currentFocusMs,
    currentBreakMs:
      state.phase === 'break' ? state.currentBreakMs + Math.max(0, elapsed) : state.currentBreakMs,
    totalFocusMs:
      state.phase === 'focus' ? state.totalFocusMs + Math.max(0, elapsed) : state.totalFocusMs,
    totalBreakMs:
      state.phase === 'break' ? state.totalBreakMs + Math.max(0, elapsed) : state.totalBreakMs,
    startedAt: null,
    endsAt: null,
    pausedRemaining: Math.max(0, remaining),
    updatedAt: t,
  }

  await clearAlarm()
  await clearEyeBreakAlarms()
  return saveState(next)
}

// Resume the timer
export async function resumeTimer(): Promise<TimerState> {
  const state = await loadState()

  if (state.status !== 'paused' || state.pausedRemaining == null) {
    return state
  }

  const t = now()
  const next: TimerState = {
    ...state,
    status: 'running',
    startedAt: t,
    endsAt: t + state.pausedRemaining,
    pausedRemaining: null,
    updatedAt: t,
  }

  await setAlarm(next.endsAt!)
  await setEyeBreakAlarms(next, t)
  return saveState(next)
}

// Skip the current timer phase
export async function skipTimer(): Promise<TimerState> {
  const state = await ensureState()

  if (state.status === 'idle') {
    return startTimer(state.mode)
  }

  const t = now()
  const next = transitionToNextPhase(state, t)

  if (next.endsAt != null) {
    await setAlarm(next.endsAt)
    await setEyeBreakAlarms(next, t)
  }

  return saveState(next)
}

// Reset the timer to idle state
export async function resetTimer(): Promise<TimerState> {
  const state = await ensureState()
  const t = now()

  const next: TimerState = {
    ...state,
    status: 'idle',
    phase: null,
    sessionNumber: 0,
    currentFocusMs: 0,
    currentBreakMs: 0,
    startedAt: null,
    endsAt: null,
    pausedRemaining: null,
    eyeReminders: {},
    updatedAt: t,
  }

  await clearAlarm()
  await clearEyeBreakAlarms()
  return saveState(next)
}

// Handle the browser alarm event
export async function handleAlarm(): Promise<TimerState> {
  const state = await ensureState()
  const t = now()

  if (state.status !== 'running' || state.endsAt == null || state.endsAt > t) {
    return state
  }

  const next = transitionToNextPhase(state, state.endsAt)

  if (next.endsAt != null) {
    await setAlarm(next.endsAt)
    await setEyeBreakAlarms(next, t)
  }

  return saveState(next)
}

// Restore the alarm when the extension starts up
export async function restoreAlarmOnStartup(): Promise<TimerState> {
  const state = await ensureState()

  if (state.status === 'running' && state.endsAt != null) {
    await setAlarm(state.endsAt)
    await setEyeBreakAlarms(state)
  } else {
    await clearAlarm()
    await clearEyeBreakAlarms()
  }

  return state
}

// Show an eye-break notification and mark the threshold as shown
export async function handleEyeBreakAlarm(alarmName: string): Promise<void> {
  const threshold = alarmName === EYE_BREAK_20 ? TWENTY_MINUTES : FORTY_MINUTES
  const state = await ensureState()
  const t = now()

  if (state.status === 'running' && state.endsAt != null) {
    await setAlarm(state.endsAt)
  }

  if (state.phase !== 'focus' || state.status !== 'running' || state.eyeReminders[threshold]) {
    return
  }

  const elapsed = state.currentFocusMs + (state.startedAt != null ? Math.max(0, t - state.startedAt) : 0)

  if (elapsed < threshold) {
    await setEyeBreakAlarms(state, t)
    return
  }

  const next: TimerState = {
    ...state,
    eyeReminders: { ...state.eyeReminders, [threshold]: true },
    updatedAt: t,
  }

  await saveState(next)
  await chrome.notifications.create('', {
    type: 'basic',
    iconUrl: '',
    title: 'OrdinaryPom',
    message: EYE_MESSAGES[threshold],
    silent: true,
  })
}
