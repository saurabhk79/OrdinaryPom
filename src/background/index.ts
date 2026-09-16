import { ALARM_NAME } from '../shared/constants';
import type { TimerCommand } from '../shared/messages';
import {
  handleAlarm,
  pauseTimer,
  resetTimer,
  restoreAlarmOnStartup,
  resumeTimer,
  skipTimer,
  startTimer,
} from './timer';

// Listen for alarms and handle them
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    void handleAlarm();
  }
});

// Listen for the extension being installed and restore the alarm
chrome.runtime.onInstalled.addListener(() => {
  void restoreAlarmOnStartup();
});

// Listen for the browser starting up and restore the alarm
chrome.runtime.onStartup.addListener(() => {
  void restoreAlarmOnStartup();
});

// Listen for messages from the popup and handle them
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  const command = request as TimerCommand;

  const handle = async () => {
    switch (command.type) {
      case 'start':
        return startTimer(command.mode);
      case 'pause':
        return pauseTimer();
      case 'resume':
        return resumeTimer();
      case 'skip':
        return skipTimer();
      case 'reset':
        return resetTimer();
      default:
        return restoreAlarmOnStartup();
    }
  };

  handle()
    .then((state) => sendResponse(state))
    .catch((error) => {
      console.error('[OrdinaryPom] timer command failed:', error);
      sendResponse(null);
    });

  return true;
});

export {};
