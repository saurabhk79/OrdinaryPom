import { useEffect, useState } from 'react'
import { DEFAULT_MODE, MODES, type TimerMode, type TimerState } from '../types'
import { STORAGE_KEY } from '../shared/constants'
import { formatDuration, formatTotalMinutes } from '../shared/time'

const MODE_LABELS: Record<TimerMode, string> = {
  lowEnergy: 'Low Energy',
  normal: 'Normal',
  deepWork: 'Deep Work',
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

export function App() {
  const [state, setState] = useState<TimerState | null>(null)
  const [remainingMs, setRemainingMs] = useState(0)
  const [selectedMode, setSelectedMode] = useState<TimerMode>(DEFAULT_MODE)

  useEffect(() => {
    void sendCommand({ type: 'getState' }).then(setState)

    const onChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes[STORAGE_KEY]) {
        setState(changes[STORAGE_KEY].newValue as TimerState)
      }
    }

    chrome.storage.local.onChanged.addListener(onChange)
    return () => chrome.storage.local.onChanged.removeListener(onChange)
  }, [])

  useEffect(() => {
    if (!state) return

    setSelectedMode(state.mode)

    const tick = () => {
      setRemainingMs(computeRemainingMs(state))
    }

    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
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
  const isPaused = state?.status === 'paused'

  const primaryAction = isIdle ? onStart : isRunning ? onPause : onResume
  const primaryLabel = isIdle ? 'Start' : isRunning ? 'Pause' : 'Resume'

  const modeLabel = state?.phase ? state.phase.toUpperCase() : 'READY'

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

      <section className="mode-selector" aria-label="Mode selector">
        {(Object.keys(MODES) as TimerMode[]).map((mode) => (
          <button
            key={mode}
            type="button"
            aria-pressed={selectedMode === mode}
            disabled={!isIdle}
            className={selectedMode === mode ? 'mode-active' : ''}
            onClick={() => setSelectedMode(mode)}
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
          Skip
        </button>

        <button className="reset-action" type="button" onClick={onReset}>
          Reset
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
    </main>
  )
}
