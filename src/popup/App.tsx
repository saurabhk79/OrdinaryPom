import { useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_MODE,
  MODES,
  type DailyStats,
  type DomainState,
  type TimerMode,
  type TimerState,
} from '../types'
import { DOMAIN_KEY, PREFERRED_MODE_KEY, STORAGE_KEY } from '../shared/constants'
import { formatDuration, formatTotalMinutes } from '../shared/time'

const MODE_LABELS: Record<TimerMode, string> = {
  lowEnergy: 'Low Energy',
  normal: 'Normal',
  deepWork: 'Good',
}

type TimerCommand =
  | { type: 'start'; mode?: TimerMode }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'skip' }
  | { type: 'reset' }
  | { type: 'getState' }

function sendCommand(command: TimerCommand): Promise<TimerState> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(command, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
      } else {
        resolve(response as TimerState)
      }
    })
  })
}

function computeRemainingMs(state: TimerState | null): number {
  if (!state) return 0

  if (state.status === 'running' && state.endsAt != null) {
    return Math.max(0, state.endsAt - Date.now())
  }

  if (state.status === 'paused' && state.pausedRemaining != null) {
    return state.pausedRemaining
  }

  if (state.phase === 'break') {
    return MODES[state.mode].break
  }

  return MODES[state.mode ?? DEFAULT_MODE].focus
}

function buildDomainStats(
  domainState: DomainState | null,
): { domain: string; ms: number }[] {
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

export function App() {
  const [state, setState] = useState<TimerState | null>(null)
  const [remainingMs, setRemainingMs] = useState(0)
  const [selectedMode, setSelectedMode] = useState<TimerMode>(DEFAULT_MODE)
  const [domainState, setDomainState] = useState<DomainState | null>(null)
  const [daily, setDaily] = useState<DailyStats | null>(null)

  const dailyKey = useMemo(
    () => `ordinaryPomDaily:${new Date().toLocaleDateString('en-CA')}`,
    [],
  )

  useEffect(() => {
    const load = async () => {
      const [nextState, stored] = await Promise.all([
        sendCommand({ type: 'getState' }),
        chrome.storage.local.get([DOMAIN_KEY, PREFERRED_MODE_KEY, dailyKey]),
      ])
      setState(nextState)
      setDomainState((stored[DOMAIN_KEY] as DomainState) ?? null)
      setDaily((stored[dailyKey] as DailyStats) ?? null)
      setSelectedMode(
        (stored[PREFERRED_MODE_KEY] as TimerMode) ??
          nextState.mode ??
          DEFAULT_MODE,
      )
    }

    void load()

    const onChange = (changes: {
      [key: string]: chrome.storage.StorageChange
    }) => {
      if (changes[STORAGE_KEY]) {
        setState(changes[STORAGE_KEY].newValue as TimerState)
      }
      if (changes[DOMAIN_KEY]) {
        setDomainState(changes[DOMAIN_KEY].newValue as DomainState)
      }
      if (changes[dailyKey]) {
        setDaily(changes[dailyKey].newValue as DailyStats)
      }
    }

    chrome.storage.local.onChanged.addListener(onChange)
    return () => chrome.storage.local.onChanged.removeListener(onChange)
  }, [dailyKey])

  useEffect(() => {
    if (!state) return

    const tick = () => {
      setRemainingMs(computeRemainingMs(state))
    }

    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [state])

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (state?.status === 'running' || state?.status === 'paused') {
        event.preventDefault()
        event.returnValue = ''
      }
    }

    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [state])

  const applyState = async (command: TimerCommand) => {
    const next = await sendCommand(command)
    setState(next)
  }

  const onStart = () => applyState({ type: 'start', mode: selectedMode })
  const onPause = () => applyState({ type: 'pause' })
  const onResume = () => applyState({ type: 'resume' })
  const onSkip = () => applyState({ type: 'skip' })
  const onReset = () => applyState({ type: 'reset' })

  const isIdle = state?.status === 'idle'
  const isRunning = state?.status === 'running'

  const primaryAction = isIdle ? onStart : isRunning ? onPause : onResume
  const primaryLabel = isIdle ? 'Start' : isRunning ? 'Pause' : 'Resume'
  const skipLabel = state?.phase === 'break' ? 'Skip break' : 'Skip'
  const endLabel = state?.phase === 'break' ? 'End session' : 'Reset'

  const modeLabel = state?.phase ? state.phase.toUpperCase() : 'READY'

  const domainStats = useMemo(
    () => buildDomainStats(domainState),
    [domainState],
  )

  return (
    <main className="popup-shell">
      <header className="popup-header">
        <h1>OrdinaryPom</h1>
      </header>

      <section className="timer" aria-label="Current timer">
        <p className="timer-phase">{modeLabel}</p>
        <time className="timer-display" dateTime="PT1M">
          {formatDuration(remainingMs)}
        </time>
        <p className="timer-session">
          {state ? `Session ${state.sessionNumber}` : 'Set a mode below'}
        </p>
      </section>

      {state?.phase === 'break' && (
        <section className="break-card" aria-label="Break guidance">
          <p className="break-title">Get away from the screen.</p>
          <ul className="break-suggestions">
            <li>Walk around</li>
            <li>Look outside</li>
            <li>Stretch</li>
            <li>Drink water</li>
          </ul>
        </section>
      )}

      <section className="mode-selector" aria-label="Mode selector">
        {(Object.keys(MODES) as TimerMode[]).map((mode) => (
          <button
            key={mode}
            type="button"
            aria-pressed={selectedMode === mode}
            disabled={!isIdle}
            className={selectedMode === mode ? 'mode-active' : ''}
            onClick={() => {
              setSelectedMode(mode)
              void chrome.storage.local.set({ [PREFERRED_MODE_KEY]: mode })
            }}
            title={`${MODES[mode].focus / 60_000}m focus / ${MODES[mode].break / 60_000}m break`}
          >
            {MODE_LABELS[mode]}
          </button>
        ))}
      </section>

      <section className="controls" aria-label="Timer controls">
        <button
          className="primary-action"
          type="button"
          onClick={primaryAction}
        >
          {primaryLabel}
        </button>

        <button type="button" onClick={onSkip} disabled={isIdle}>
          {skipLabel}
        </button>

        <button className="reset-action" type="button" onClick={onReset}>
          {endLabel}
        </button>
      </section>

      <section className="stats" aria-label="Daily statistics">
        <dl>
          <div>
            <dt>Focused</dt>
            <dd>{state ? formatTotalMinutes(state.totalFocusMs) : '0m'}</dd>
          </div>
          <div>
            <dt>Sessions</dt>
            <dd>{state?.completedSessions ?? 0}</dd>
          </div>
          <div>
            <dt>Longest</dt>
            <dd>{state ? formatDuration(state.longestFocusMs) : '00:00'}</dd>
          </div>
        </dl>
      </section>

      <section className="domain-stats" aria-label="Where your focus went">
        <h2>Where your focus went</h2>
        {domainStats.length === 0 ? (
          <p className="domain-empty">
            Start a focus session to track domains.
          </p>
        ) : (
          <ul>
            {domainStats.map(({ domain, ms }) => (
              <li key={domain}>
                <span className="domain-name" title={domain}>
                  {domain}
                </span>
                <span className="domain-time">{formatTotalMinutes(ms)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="daily-stats" aria-label="Daily dashboard">
        <h2>Today</h2>
        <dl className="daily-grid">
          <div>
            <dt>Focused</dt>
            <dd>{formatTotalMinutes(daily?.totalFocusMs ?? 0)}</dd>
          </div>
          <div>
            <dt>Breaks</dt>
            <dd>{formatTotalMinutes(daily?.totalBreakMs ?? 0)}</dd>
          </div>
          <div>
            <dt>Sessions</dt>
            <dd>{daily?.completedSessions ?? 0}</dd>
          </div>
          <div>
            <dt>Longest focus</dt>
            <dd>{formatDuration(daily?.longestFocusMs ?? 0)}</dd>
          </div>
          <div>
            <dt>Longest screen</dt>
            <dd>{formatDuration(daily?.longestScreenMs ?? 0)}</dd>
          </div>
          <div>
            <dt>Eye rests</dt>
            <dd>{daily?.eyeRestReminders ?? 0}</dd>
          </div>
        </dl>

        <h3>Top domains</h3>
        {daily?.topDomains.length ? (
          <ul>
            {daily.topDomains.map(({ domain, ms }) => (
              <li key={domain}>
                <span className="domain-name" title={domain}>
                  {domain}
                </span>
                <span className="domain-time">{formatTotalMinutes(ms)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="domain-empty">No data yet.</p>
        )}
      </section>
    </main>
  )
}
