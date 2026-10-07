const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html'

let creatingOffscreen: Promise<void> | null = null

async function ensureOffscreenDocument(): Promise<void> {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType],
  })
  if (contexts.length > 0) {
    return
  }

  if (creatingOffscreen) {
    await creatingOffscreen
    return
  }

  creatingOffscreen = chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: ['AUDIO_PLAYBACK' as chrome.offscreen.Reason],
    justification: 'Play timer completion sounds when the popup is closed.',
  })
  await creatingOffscreen
  creatingOffscreen = null
}

export async function playTimerSound(frequency = 440): Promise<void> {
  await ensureOffscreenDocument()
  await chrome.runtime.sendMessage({
    type: 'play-sound',
    frequency,
  })
}
