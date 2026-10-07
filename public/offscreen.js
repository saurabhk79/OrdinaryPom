chrome.runtime.onMessage.addListener((message) => {
  if (message.type !== 'play-sound') {
    return
  }

  const ctx = new (window.AudioContext || window.webkitAudioContext)()
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.type = 'sine'
  osc.frequency.value =
    typeof message.frequency === 'number' ? message.frequency : 440

  gain.gain.setValueAtTime(0.25, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)

  osc.connect(gain)
  gain.connect(ctx.destination)

  osc.start()
  osc.stop(ctx.currentTime + 0.3)
})
