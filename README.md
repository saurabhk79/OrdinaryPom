# OrdinaryPom

A minimal, dark-first Pomodoro timer with screen-fatigue protection for developers who spend long hours on a laptop.

## What it does

- Pomodoro focus sessions with three energy modes: Low Energy (25/5), Normal (45/10), and Good (60/10).
- Break guidance that gently encourages you to step away from the screen.
- Eye-rest reminders at 20 and 40 minutes into a focus session.
- Long-session screen-time warnings at 2 and 4 hours.
- Lightweight domain tracking during focus sessions, so you can see where your focus went.
- Daily stats that persist locally.

## Tech stack

- React 19 + TypeScript
- Vite
- Chrome Extension Manifest V3
- Chrome Storage, Notifications, Alarms, Idle, Tabs, and Windows APIs
- No backend, no authentication, no external APIs

## Build

```bash
npm install
npm run build
```

The built extension will be in the `dist/` folder.

## Load into Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the `dist/` folder.

## Privacy

Only the active domain (e.g. `github.com`) and time spent are stored locally. No page contents, URLs beyond the hostname, form inputs, or personal data are collected.
