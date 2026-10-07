import { SCREEN_CHECK, SCREEN_TIME_KEY } from '../shared/constants'
import type { ScreenTimeState } from '../types'

const now = () => Date.now()

const MS_PER_MIN = 60_000
const RESET_IDLE_MIN = 5
const WARN_2H = 2 * 60 * MS_PER_MIN
const WARN_4H = 4 * 60 * MS_PER_MIN

const MESSAGES: Record<number, string> = {
  [WARN_2H]: "You've been on the screen for 2 hours. Take a proper break.",
  [WARN_4H]:
    "You've been on the screen for 4 hours. Take a longer offline break.",
}

const createInitialState = (): ScreenTimeState => ({
  screenTimeMs: 0,
  longestScreenMs: 0,
  consecutiveIdleMinutes: 0,
  lastUpdatedAt: now(),
  shown: {},
})

async function loadState(): Promise<ScreenTimeState> {
  const stored = await chrome.storage.local.get(SCREEN_TIME_KEY)
  const saved = stored[SCREEN_TIME_KEY] as Partial<ScreenTimeState> | undefined
  return { ...createInitialState(), ...(saved ?? {}) }
}

async function saveState(state: ScreenTimeState): Promise<void> {
  await chrome.storage.local.set({
    [SCREEN_TIME_KEY]: { ...state, lastUpdatedAt: now() },
  })
}

async function showWarning(message: string): Promise<void> {
  await chrome.notifications.create('', {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icon.png'),
    title: 'OrdinaryPom',
    message,
    silent: true,
  })
}

async function checkWarnings(state: ScreenTimeState): Promise<void> {
  if (state.screenTimeMs >= WARN_4H && !state.shown[WARN_4H]) {
    state.shown[WARN_4H] = true
    await saveState(state)
    await showWarning(MESSAGES[WARN_4H])
    return
  }

  if (state.screenTimeMs >= WARN_2H && !state.shown[WARN_2H]) {
    state.shown[WARN_2H] = true
    await saveState(state)
    await showWarning(MESSAGES[WARN_2H])
  }
}

export async function updateScreenTime(): Promise<ScreenTimeState> {
  const state = await loadState()
  const t = now()

  if (t - state.lastUpdatedAt < MS_PER_MIN) {
    return state
  }

  const idleState = await chrome.idle.queryState(60)

  if (idleState === 'active') {
    const next: ScreenTimeState = {
      ...state,
      screenTimeMs: state.screenTimeMs + MS_PER_MIN,
      consecutiveIdleMinutes: 0,
      lastUpdatedAt: t,
    }
    await saveState(next)
    await checkWarnings(next)
    return next
  }

  const idleMinutes = state.consecutiveIdleMinutes + 1

  if (idleMinutes >= RESET_IDLE_MIN) {
    const next: ScreenTimeState = {
      ...createInitialState(),
      longestScreenMs: Math.max(state.longestScreenMs, state.screenTimeMs),
    }
    await saveState(next)
    return next
  }

  const next: ScreenTimeState = {
    ...state,
    consecutiveIdleMinutes: idleMinutes,
    lastUpdatedAt: t,
  }
  await saveState(next)
  return next
}

export async function restoreScreenTime(): Promise<void> {
  const state = await loadState()
  const t = now()
  await saveState({ ...state, lastUpdatedAt: t })

  await chrome.alarms.clear(SCREEN_CHECK)
  chrome.alarms.create(SCREEN_CHECK, { periodInMinutes: 1 })
}
