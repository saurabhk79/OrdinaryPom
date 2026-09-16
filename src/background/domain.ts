import { DOMAIN_KEY } from '../shared/constants'
import type { DomainState } from '../types'
import { loadState as loadTimerState } from './timer'

const now = () => Date.now()

const createInitialState = (): DomainState => ({
  currentDomain: null,
  startedAt: null,
  totals: {},
  lastUpdatedAt: now(),
})

async function loadDomainState(): Promise<DomainState> {
  const stored = await chrome.storage.local.get(DOMAIN_KEY)
  const saved = stored[DOMAIN_KEY] as Partial<DomainState> | undefined
  return { ...createInitialState(), ...(saved ?? {}) }
}

async function saveDomainState(state: DomainState): Promise<void> {
  await chrome.storage.local.set({ [DOMAIN_KEY]: { ...state, lastUpdatedAt: now() } })
}

function closeCurrentSegment(state: DomainState, t = now()): DomainState {
  if (state.startedAt == null || state.currentDomain == null) {
    return state
  }

  const elapsed = Math.max(0, t - state.startedAt)
  const current = state.totals[state.currentDomain] ?? 0

  return {
    ...state,
    startedAt: null,
    totals: {
      ...state.totals,
      [state.currentDomain]: current + elapsed,
    },
  }
}

export async function setActiveDomain(domain: string | null): Promise<void> {
  let state = await loadDomainState()
  const t = now()

  state = closeCurrentSegment(state, t)
  state.currentDomain = domain
  state.lastUpdatedAt = t

  await saveDomainState(state)
  await syncWithTimerState()
}

export async function syncWithTimerState(): Promise<void> {
  const [state, timer] = await Promise.all([loadDomainState(), loadTimerState()])
  const t = now()
  const shouldTrack = timer.status === 'running' && timer.phase === 'focus' && state.currentDomain != null

  if (shouldTrack && state.startedAt == null) {
    await saveDomainState({ ...state, startedAt: t, lastUpdatedAt: t })
    return
  }

  if (!shouldTrack && state.startedAt != null) {
    const updated = closeCurrentSegment({ ...state }, t)
    updated.lastUpdatedAt = t
    await saveDomainState(updated)
  }
}

export async function updateActiveDomain(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })

  if (!tab?.id) {
    await setActiveDomain(null)
    return
  }

  chrome.tabs.sendMessage(tab.id, { type: 'getDomain' }, (response) => {
    if (chrome.runtime.lastError) {
      void setActiveDomain(null)
      return
    }

    const hostname =
      typeof response === 'object' && response != null && 'hostname' in response
        ? (response as { hostname: string }).hostname
        : null

    void setActiveDomain(hostname)
  })
}
