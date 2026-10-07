import {
  ALARM_NAME,
  BADGE_ALARM_NAME,
  EYE_BREAK_20,
  EYE_BREAK_40,
  SCREEN_CHECK,
} from '../shared/constants'
import {
  setActiveDomain,
  syncWithTimerState,
  updateActiveDomain,
} from './domain'
import { updateDailyStats } from './daily'
import type { TimerCommand } from '../shared/messages'
import {
  handleAlarm,
  handleEyeBreakAlarm,
  pauseTimer,
  resetTimer,
  restoreAlarmOnStartup,
  resumeTimer,
  skipTimer,
  startTimer,
  updateBadge,
} from './timer'
import { restoreScreenTime, updateScreenTime } from './screenTime'

// Listen for alarms and handle them
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    void handleAlarm().then(() => {
      void syncWithTimerState()
      void updateDailyStats()
    })
  } else if (alarm.name === BADGE_ALARM_NAME) {
    void restoreAlarmOnStartup().then(updateBadge)
  } else if (alarm.name === EYE_BREAK_20 || alarm.name === EYE_BREAK_40) {
    void handleEyeBreakAlarm(alarm.name)
  } else if (alarm.name === SCREEN_CHECK) {
    void updateScreenTime()
  }
})

// Listen for the extension being installed and restore the alarm
chrome.runtime.onInstalled.addListener(() => {
  void restoreAlarmOnStartup()
  void restoreScreenTime()
  void updateActiveDomain()
})

// Listen for the browser starting up and restore the alarm
chrome.runtime.onStartup.addListener(() => {
  void restoreAlarmOnStartup()
  void restoreScreenTime()
  void updateActiveDomain()
})

// Listen for tab and window changes to keep the active domain up to date
chrome.tabs.onActivated.addListener(() => {
  void updateActiveDomain()
})

chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
  if (changeInfo.status === 'complete') {
    void updateActiveDomain()
  }
})

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    void setActiveDomain(null)
  } else {
    void updateActiveDomain()
  }
})

// Listen for messages from the popup and handle them
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  const command = request as TimerCommand

  const handle = async () => {
    switch (command.type) {
      case 'start':
        return startTimer(command.mode)
      case 'pause':
        return pauseTimer()
      case 'resume':
        return resumeTimer()
      case 'skip':
        return skipTimer()
      case 'reset':
        return resetTimer()
      default:
        return restoreAlarmOnStartup()
    }
  }

  handle()
    .then((state) => {
      sendResponse(state)
      void syncWithTimerState()
      void updateDailyStats()
    })
    .catch((error) => {
      console.error('[OrdinaryPom] timer command failed:', error)
      sendResponse(null)
    })

  return true
})

export {}
