import { useEffect, useRef, useState } from 'react';
import { DEFAULT_MODE, MODES, type TimerMode, type TimerState } from '../types';
import { STORAGE_KEY } from '../shared/constants';
import { formatDuration } from '../shared/time';

const MODE_LABELS: Record<TimerMode, string> = {
  lowEnergy: 'Low Energy',
  normal: 'Normal',
  deepWork: 'Deep Work',
};

// Send a message to the background script and await the response
function sendCommand(type: TimerStateCommand): Promise<TimerState> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(type, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response as TimerState);
      }
    });
  });
}

// Define the possible commands that can be sent to the background script
type TimerStateCommand =
  | { type: 'start'; mode?: TimerMode } // Start the timer with an optional mode
  | { type: 'pause' } // Pause the timer
  | { type: 'resume' } // Resume the timer
  | { type: 'skip' } // Skip the current phase
  | { type: 'reset' } // Reset the timer
  | { type: 'getState' }; // Get the current timer state

// Calculate the remaining time in milliseconds based on the current timer state
function computeRemainingMs(state: TimerState | null): number {
  if (!state) return 0;

  if (state.status === 'running' && state.endsAt != null) {
    return Math.max(0, state.endsAt - Date.now());
  }

  if (state.status === 'paused' && state.pausedRemaining != null) {
    return state.pausedRemaining;
  }

  if (state.phase === 'break') {
    return MODES[state.mode].break;
  }

  return MODES[state.mode ?? DEFAULT_MODE].focus;
}

export function App() {
  const [state, setState] = useState<TimerState | null>(null);
  const [remainingMs, setRemainingMs] = useState(0);
  const [selectedMode, setSelectedMode] = useState<TimerMode>(DEFAULT_MODE);

  // Initialize the timer state and set up storage change listeners
  useEffect(() => {
    // Get the current timer state from the background script
    void sendCommand({ type: 'getState' }).then(setState);

    // Define a callback to handle storage changes
    const onChange = (changes: {
      [key: string]: chrome.storage.StorageChange;
    }) => {
      if (changes[STORAGE_KEY]) {
        setState(changes[STORAGE_KEY].newValue as TimerState);
      }
    };

    // Listen for storage changes
    chrome.storage.local.onChanged.addListener(onChange);
    return () => chrome.storage.local.onChanged.removeListener(onChange);
  }, []);

  // Update the remaining time and selected mode when the state changes
  useEffect(() => {
    if (!state) return;

    // Update the selected mode when the state changes
    setSelectedMode(state.mode);

    const tick = () => {
      const next = computeRemainingMs(state);
      setRemainingMs(next);
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [state]);

  // Helper function to update the timer state
  const applyState = async (command: TimerStateCommand) => {
    const next = await sendCommand(command);
    setState(next);
  };

  const onStart = () => applyState({ type: 'start', mode: selectedMode }); // Start the timer with the selected mode
  const onPause = () => applyState({ type: 'pause' }); // Pause the timer
  const onResume = () => applyState({ type: 'resume' }); // Resume the timer
  const onSkip = () => applyState({ type: 'skip' }); // Skip the current phase
  const onReset = () => applyState({ type: 'reset' }); // Reset the timer

  const isIdle = state?.status === 'idle'; // Timer is idle
  const isRunning = state?.status === 'running'; // Timer is running
  const isPaused = state?.status === 'paused'; // Timer is paused

  const label = state?.phase ? state.phase.toUpperCase() : 'READY';

  return (
    <main className="popup-shell">
      <header className="popup-header">
        <p className="eyebrow">OrdinaryPom</p>
        <h1>{label}</h1>
      </header>

      <section className="timer" aria-label="Current timer">
        <p className="timer-label">
          {state ? `Session ${state.sessionNumber}` : 'Set a mode'}
        </p>
        <time dateTime="PT1M">{formatDuration(remainingMs)}</time>
      </section>

      <div className="mode-select">
        <label htmlFor="mode">Mode</label>
        <select
          id="mode"
          value={selectedMode}
          disabled={!isIdle}
          onChange={(event) => setSelectedMode(event.target.value as TimerMode)}
        >
          {(Object.keys(MODES) as TimerMode[]).map((mode) => (
            <option key={mode} value={mode}>
              {MODE_LABELS[mode]} · {MODES[mode].focus / 60_000}m /{' '}
              {MODES[mode].break / 60_000}m
            </option>
          ))}
        </select>
      </div>

      <div className="controls">
        {isIdle ? (
          <button className="primary-action" type="button" onClick={onStart}>
            Start
          </button>
        ) : isRunning ? (
          <button className="primary-action" type="button" onClick={onPause}>
            Pause
          </button>
        ) : (
          <button className="primary-action" type="button" onClick={onResume}>
            Resume
          </button>
        )}

        <button type="button" onClick={onSkip} disabled={isIdle}>
          Skip
        </button>

        <button type="button" onClick={onReset}>
          Reset
        </button>
      </div>
    </main>
  );
}
