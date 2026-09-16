# OrdinaryPom — Technical feature breakdown

## Architecture overview

OrdinaryPom is a Chrome Extension Manifest V3 application built with React 19, TypeScript, and Vite.

- **Popup UI** — React application rendered in `popup.html`. It reads and writes state through `chrome.storage` and `chrome.runtime.sendMessage`.
- **Service worker** — The authoritative timer, screen-time, domain, and daily stats engine. It runs in `src/background/index.ts` and uses `chrome.alarms` to stay alive and to fire scheduled events.
- **Content script** — A minimal script that responds with the current hostname when the service worker asks.
- **Shared state** — Everything is persisted in `chrome.storage.local`. No network calls are made.

## Build setup

- Vite bundles three entry points: `popup.html`, `src/background/index.ts`, and `src/content/index.ts`.
- The popup is a standard React app.
- The background is an ES module. Its dependencies are split into a shared `constants` chunk because Vite sees that `src/shared/constants.ts` is used by the background, popup, and content scripts.
- `tsc --noEmit` runs before Vite to check types.

## Timer engine

File: `src/background/timer.ts`

The Pomodoro timer is timestamp-driven to avoid drift:

- `startedAt` marks the start of the current running segment.
- `endsAt` marks the absolute time the current phase should end.
- `pausedRemaining` stores the remaining time in the current phase when paused.
- The authoritative state is stored under `ordinaryPomTimer` in `chrome.storage.local`.

Commands: `start`, `pause`, `resume`, `skip`, `reset`. Each command persists the updated state and reschedules `chrome.alarms` as needed.

`chrome.alarms.create` is used with an exact `when` value equal to `endsAt`. When the alarm fires, `transitionToNextPhase` moves from focus to break or break to focus. This means the timer survives popup close and service worker suspension.

`reconcileState` is called whenever state is loaded. It catches up any missed phase transitions, which is important if the service worker was suspended past an `endsAt`.

### Focus and break time tracking

- `currentFocusMs` and `currentBreakMs` accumulate the time in the current phase across pause/resume cycles.
- `totalFocusMs` and `totalBreakMs` accumulate completed time.
- `longestFocusMs` is updated with `Math.max` whenever a focus phase ends.
- `completedSessions` increments each time a focus phase ends.

## Energy modes

Modes are defined in `src/types/index.ts`:

- `lowEnergy` — 25 min focus / 5 min break
- `normal` — 45 min focus / 10 min break
- `deepWork` — 60 min focus / 10 min break

The popup labels `deepWork` as "Good". The preferred mode is stored under `ordinaryPomPreferredMode` and can only be changed while the timer is idle.

## Eye-rest reminders

Files: `src/background/timer.ts`, `src/background/index.ts`

During a focus session, two additional `chrome.alarms` are created:

- `ordinaryPomEyeBreak20` at `startedAt + 20 minutes - currentFocusMs`
- `ordinaryPomEyeBreak40` at `startedAt + 40 minutes - currentFocusMs`

The `currentFocusMs` subtraction makes the reminders respect actual focus time, including pauses. When an alarm fires, `handleEyeBreakAlarm` sets `eyeReminders[threshold] = true` and shows a `chrome.notifications` basic notification. If the threshold has already passed, the alarm is not scheduled. Reminders are cleared when the session is paused, reset, or transitions to break.

## Screen-time protection

File: `src/background/screenTime.ts`

Every minute, a `chrome.alarms` period named `ordinaryPomScreenCheck` runs `updateScreenTime`. It uses `chrome.idle.queryState(60)` to ask whether the user is currently active.

- If active, `screenTimeMs` is increased by one minute.
- If idle/locked, `consecutiveIdleMinutes` is incremented.
- After 5 consecutive idle minutes, a reset occurs. Before reset, `longestScreenMs = Math.max(longestScreenMs, screenTimeMs)`.

Warnings are sent at 2 hours and 4 hours. The `shown` record prevents them from repeating. Because the check runs in the service worker, it continues even when the popup is closed.

## Domain tracking

Files: `src/background/domain.ts`, `src/content/index.ts`, `src/background/index.ts`

The content script only exposes the current `window.location.hostname` when asked. It does not send anything automatically.

The service worker listens to:

- `chrome.tabs.onActivated`
- `chrome.tabs.onUpdated` (status === `complete`)
- `chrome.windows.onFocusChanged`

When any of these fire, `updateActiveDomain` queries `chrome.tabs.query({ active: true, lastFocusedWindow: true })` and sends a `getDomain` message to the active tab. The content script responds with `hostname`. If the message fails (e.g. a `chrome://` page or new tab page), `currentDomain` is set to `null`.

`setActiveDomain` closes the previous domain segment, adds elapsed time to `totals[domain]`, and sets `currentDomain`. `syncWithTimerState` then starts or stops tracking based on whether the timer is in a `focus` phase and running. This ensures time is only tracked during focused work.

## Daily statistics

File: `src/background/daily.ts`

`updateDailyStats` reads the current `TimerState`, `ScreenTimeState`, and `DomainState` and writes a snapshot under `ordinaryPomDaily:<local-date>` in `chrome.storage.local`.

The `DailyStats` object includes:

- `totalFocusMs`
- `completedSessions`
- `totalBreakMs`
- `longestFocusMs`
- `longestScreenMs`
- `eyeRestReminders` (count of completed eye-break notifications)
- `topDomains` (top 3 by milliseconds)

It is called after every timer command and phase transition, so the dashboard stays current.

## Popup UI

Files: `src/popup/App.tsx`, `src/popup/styles.css`

The React popup:

- Loads `TimerState`, `DomainState`, `DailyStats`, and the preferred mode from `chrome.storage.local`.
- Subscribes to `chrome.storage.local.onChanged` so it updates in real time.
- Uses `useState` and `useMemo` for local state; the 1-second remaining timer uses `setInterval` and is cleared on unmount.
- Shows the current phase, remaining time, mode selector, controls, a break card during breaks, domain stats, and daily stats.

## Privacy and permissions

Declared permissions in `manifest.json`:

- `storage` — required to persist all local state.
- `notifications` — required for eye-rest, break, and screen-time notifications.
- `alarms` — required to keep the timer and screen-time check alive in a non-persistent service worker.

`chrome.idle`, `chrome.tabs`, and `chrome.windows` are used without additional permissions. Only `hostname` is collected. No page contents, no full URLs, no form data, no network requests.
